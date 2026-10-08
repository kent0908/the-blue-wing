import { randomUUID } from "node:crypto";
import { sql } from "./db";
import { BillingError, billingCoverage, consoleConfig, fetchUsageRequest, fetchUsageWindow, type BillingRecord } from "./sirayaConsole";
import type { CrmRange } from "./crmRange";

type QueryClient = { query: (query: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
export function billingCutoff(range: CrmRange, now = new Date()): CrmRange {
  const until = Math.min(Date.parse(range.until),Math.floor(now.getTime()/1000)*1000);
  if (until <= Date.parse(range.since)) throw new BillingError("future_sync",400);
  return {...range,until:new Date(until).toISOString()};
}
/** Only an exact provider Request ID may attach a cost. No time/model guessing. */
export async function reconcileSirayaCharges(client: QueryClient, accountId: string) {
  await client.query(`with candidates as (
    select b.account_id,b.request_id,count(distinct e.charge_id) as n,min(e.charge_id) as charge,
      (select count(distinct x.account_id) from siraya_billing_records x where x.scope_account_id=$1 and x.request_id=b.request_id) as accounts
    from siraya_billing_records b left join model_request_events e
    on e.provider='siraya' and e.upstream_request_id=b.request_id and e.charge_id is not null
    where b.scope_account_id=$1 group by b.account_id,b.request_id
  ) update siraya_billing_records b set charge_id=case when c.n=1 and c.accounts=1 then c.charge else null end,
    match_state=case when c.n=1 and c.accounts=1 then 'matched' when c.n>1 or c.accounts>1 then 'ambiguous' else 'unmatched' end
    from candidates c where b.scope_account_id=$1 and b.account_id=c.account_id and b.request_id=c.request_id`, [accountId]);
  // Sum all separately billed attempts for a charge. A customer refund never removes vendor spend.
  await client.query(`update usage_events set provider_cost_usd=null,provider_cost_source=null,provider_cost_scope=null where provider_cost_source='siraya_console' and provider_cost_scope=$1
    and not exists(select 1 from siraya_billing_records b where b.scope_account_id=$1 and b.charge_id=usage_events.charge_id and b.match_state='matched' group by b.charge_id having bool_and(b.currency='USD'))`,[accountId]);
  await client.query(`with billed as (
    select charge_id,sum(cost) as cost from siraya_billing_records
    where scope_account_id=$1 and match_state='matched' group by charge_id having bool_and(currency='USD')
  ) update usage_events u set provider_cost_usd=b.cost,provider_cost_source='siraya_console',provider_cost_scope=$1 from billed b where u.charge_id=b.charge_id`, [accountId]);
}
export async function saveBillingRecords(client: QueryClient, scope: string, rows: BillingRecord[]) {
  const unique = new Set<string>();
  for (const r of rows) { const k = r.accountId + ":" + r.requestId; if (unique.has(k)) throw new BillingError("duplicate_record"); unique.add(k); }
  for (let offset = 0; offset < rows.length; offset += 500) {
    const json = JSON.stringify(rows.slice(offset, offset + 500));
    await client.query(`with incoming as (select * from jsonb_to_recordset($2::jsonb) as r("accountId" text,"requestId" text,cost numeric,currency text))
      insert into siraya_billing_revisions(scope_account_id,account_id,request_id,previous_cost,next_cost,previous_currency,next_currency)
      select $1,b.account_id,b.request_id,b.cost,r.cost,b.currency,r.currency from incoming r join siraya_billing_records b
      on b.scope_account_id=$1 and b.account_id=r."accountId" and b.request_id=r."requestId"
      where b.cost<>r.cost or b.currency<>r.currency`, [scope,json]);
    await client.query(`insert into siraya_billing_records(scope_account_id,account_id,request_id,requested_at,model,cost,currency,status,usage,performance)
      select $1,r."accountId",r."requestId",r.timestamp::timestamptz,r.model,r.cost::numeric,r.currency,r.status,r.usage,r.performance
      from jsonb_to_recordset($2::jsonb) as r("accountId" text,"requestId" text,timestamp text,model text,cost text,currency text,status text,usage jsonb,performance jsonb)
      on conflict(scope_account_id,account_id,request_id) do update set requested_at=excluded.requested_at,model=excluded.model,cost=excluded.cost,
      currency=excluded.currency,status=excluded.status,usage=excluded.usage,performance=excluded.performance,last_synced_at=now()`, [scope,json]);
  }
  await reconcileSirayaCharges(client, scope);
}
export async function syncSirayaBilling(range: CrmRange, adminId: number | null) {
  const config = consoleConfig();
  if (!config.configured) throw new BillingError("not_configured", 503);
  if (Date.parse(range.until)-Date.parse(range.since)>31*86400000) throw new BillingError("sync_range_limit",400);
  if (Date.parse(range.until)>Date.now()) throw new BillingError("future_sync",400);
  const client = await sql.connect();
  const lockName = "siraya-billing:" + config.accountId;
  let locked = false, runId: string | null = null, transaction = false;
  try {
    const lock = await client.query("select pg_try_advisory_lock(hashtextextended($1,0)) as locked",[lockName]);
    locked = lock.rows[0]?.locked === true;
    if (!locked) throw new BillingError("sync_in_progress",409);
    await client.query("update siraya_billing_syncs set state='failed',error_code='interrupted',finished_at=now() where scope_account_id=$1 and state='running'",[config.accountId]);
    runId = randomUUID();
    await client.query("insert into siraya_billing_syncs(id,scope_account_id,since,until,state,initiated_by) values($1,$2,$3,$4,'running',$5)",[runId,config.accountId,range.since,range.until,adminId]);
    const rows = await fetchUsageWindow(range.since,range.until,AbortSignal.timeout(220_000));
    await client.query("BEGIN"); transaction = true;
    // A new complete scan must not silently drop a previously billed request.
    const existing = await client.query("select account_id,request_id from siraya_billing_records where scope_account_id=$1 and requested_at >= $2 and requested_at < $3",[config.accountId,range.since,range.until]);
    const keys = new Set(rows.map(r=>r.accountId+":"+r.requestId));
    if (existing.rows.some(r=>!keys.has(r.account_id+":"+r.request_id))) throw new BillingError("previous_records_missing",409);
    await saveBillingRecords(client,config.accountId!,rows);
    await client.query("update siraya_billing_syncs set state='complete',record_count=$2,finished_at=now() where id=$1",[runId,rows.length]);
    await client.query("COMMIT"); transaction = false;
    return { runId, records: rows.length, since: range.since, until: range.until };
  } catch(error) {
    if (transaction) await client.query("ROLLBACK");
    if (runId) await client.query("update siraya_billing_syncs set state='failed',error_code=$2,finished_at=now() where id=$1",[runId,error instanceof BillingError ? error.code : "storage_failed"]);
    throw error instanceof BillingError ? error : new BillingError("storage_failed",503);
  } finally {
    try { if (locked) await client.query("select pg_advisory_unlock(hashtextextended($1,0))",[lockName]); }
    finally { client.release(); }
  }
}
export async function lookupSirayaBilling(requestId: string) {
  const config = consoleConfig();
  if (!config.configured) throw new BillingError("not_configured",503);
  const row = await fetchUsageRequest(requestId,AbortSignal.timeout(30_000));
  const client = await sql.connect();
  try { await client.query("BEGIN");
    const lock=await client.query("select pg_try_advisory_xact_lock(hashtextextended($1,0)) as locked",["siraya-billing:"+config.accountId]);
    if(!lock.rows[0]?.locked)throw new BillingError("sync_in_progress",409);
    await saveBillingRecords(client,config.accountId!,[row]); await client.query("COMMIT"); }
  catch(error) { await client.query("ROLLBACK"); throw error instanceof BillingError?error:new BillingError("storage_failed",503); }
  finally { client.release(); }
  return row;
}
export async function sirayaBillingReport(range: CrmRange, model = "", page = 1, requestId = "") {
  const config = consoleConfig();
  if (!config.accountId) return { configured:false, accountId:null, totals:[], days:[], models:[], records:[], syncs:[], coverage:{complete:false,gaps:[{since:range.since,until:range.until}]}, unbilledLocal:0, localUnidentified:0, page, hasMore:false };
  const params = [config.accountId,range.since,range.until,model,requestId];
  const where = `b.scope_account_id=$1 and b.requested_at >= $2 and b.requested_at < $3 and ($4='' or b.model=$4) and ($5='' or b.request_id=$5)`;
  const results = await Promise.all([
    sql.query(`select currency,sum(cost)::text as cost,count(*)::int as records,count(*) filter(where match_state='matched')::int as matched,
      count(*) filter(where match_state='ambiguous')::int as ambiguous,count(*) filter(where status<>'success')::int as non_success
      from siraya_billing_records b where ${where} group by currency order by currency`,params),
    sql.query(`select to_char(requested_at at time zone 'Asia/Taipei','YYYY-MM-DD') as date,currency,sum(cost)::text as cost,count(*)::int as records from siraya_billing_records b where ${where} group by 1,2 order by 1,2`,params),
    sql.query(`select model,currency,sum(cost)::text as cost,count(*)::int as records from siraya_billing_records b where ${where} group by 1,2 order by sum(cost) desc`,params),
    sql.query(`select b.account_id,b.request_id,b.requested_at,b.model,b.cost::text,b.currency,b.status,b.usage,b.performance,b.match_state,b.charge_id::text,
      u.status as local_status,case when u.cost_known then u.list_cost_usd::text end as list_estimate,
      case when u.cost_known then u.actual_cost_usd::text end as discount_estimate,
      case when u.cost_known and b.currency='USD' and (select count(*) from siraya_billing_records x where x.scope_account_id=b.scope_account_id and x.charge_id=b.charge_id)=1 then (b.cost-u.actual_cost_usd)::text end as variance
      from siraya_billing_records b left join lateral (select * from usage_events where charge_id=b.charge_id order by id desc limit 1) u on true
      where ${where} order by requested_at desc,account_id,request_id limit 101 offset $6`,[...params,(page-1)*100]),
    sql.query("select id,since,until,state,record_count,error_code,started_at,finished_at from siraya_billing_syncs where scope_account_id=$1 order by started_at desc limit 20",[config.accountId]),
    sql.query("select since,until from siraya_billing_syncs where scope_account_id=$1 and state='complete' and since < $3 and until > $2",[config.accountId,range.since,range.until]),
    sql.query(`select count(*) filter(where upstream_request_id is null)::int as unidentified,
      count(*) filter(where upstream_request_id is not null and not exists(select 1 from siraya_billing_records b where b.scope_account_id=$1 and b.request_id=e.upstream_request_id))::int as unbilled
      from model_request_events e where provider='siraya' and http_status between 200 and 299 and created_at >= $2 and created_at < $3 and ($4='' or model=$4)`,[config.accountId,range.since,range.until,model]),
  ]);
  const coverage = billingCoverage(range.since,range.until,results[5].rows.map(r=>({since:new Date(r.since).toISOString(),until:new Date(r.until).toISOString()})));
  return { configured:config.configured, accountId:config.accountId, totals:results[0].rows,days:results[1].rows,models:results[2].rows,
    records:results[3].rows.slice(0,100),syncs:results[4].rows,coverage,
    unbilledLocal:Number(results[6].rows[0]?.unbilled ?? 0),localUnidentified:Number(results[6].rows[0]?.unidentified ?? 0),page,hasMore:results[3].rows.length>100 };
}
