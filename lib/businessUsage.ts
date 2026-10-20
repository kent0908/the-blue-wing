import "server-only";
import { sql, type UserRow } from "./db";
import { isAdultVerified } from "./adultGate";
import { BusinessError, type BusinessAccount } from "./businessTypes";
import { reportRange } from "./crmRange";
import { publicBusinessGeneration, type BusinessGenerationRow } from "./businessGeneration";

const PAGE_SIZE = 50;
const STATUSES = ["submitting", "processing", "completed", "failed", "unknown"];
export function businessUsageFilters(query: URLSearchParams) {
  const model = query.get("model") ?? "", status = query.get("status") ?? "", kind = query.get("kind") ?? "", textPage = query.get("page") ?? "1";
  if ([...query.keys()].some(key => !["from", "to", "model", "status", "kind", "page"].includes(key)) ||
    !/^[A-Za-z0-9._:-]{0,160}$/.test(model) || (status && !STATUSES.includes(status)) ||
    (kind && !["image", "video", "text"].includes(kind)) || !/^[1-9]\d{0,4}$/.test(textPage) || Number(textPage) > 10000) throw new BusinessError("invalid_parameters");
  let range;
  try { range = reportRange(30, query.get("from") || undefined, query.get("to") || undefined); }
  catch { throw new BusinessError("invalid_parameters"); }
  return { range, model, status, kind, page: Number(textPage) };
}

/** Aggregates cover the entire filtered owned history, not merely the current 50 rows. */
export async function businessUsageReport(user: UserRow, account: BusinessAccount, query: URLSearchParams) {
  const filters = businessUsageFilters(query);
  const adult = isAdultVerified(user);
  const params = [account.id, user.id, adult, filters.range.since, filters.range.until, filters.model, filters.status, filters.kind];
  const where = `account_id=$1 and user_id=$2 and ($3::boolean or nsfw=false)
    and created_at >= $4::timestamptz and created_at < $5::timestamptz
    and ($6='' or model=$6) and ($7='' or status=$7) and ($8='' or kind=$8)`;
  const verified = "billing_status='matched' and provider_currency='USD' and provider_cost is not null";
  const [jobs, statistics, models] = await Promise.all([
    sql.query<BusinessGenerationRow>(`select * from business_generations where ${where} order by created_at desc,id desc limit $9 offset $10`, [...params, PAGE_SIZE, (filters.page - 1) * PAGE_SIZE]),
    sql.query<{ requests: number; completed: number; failed: number; pending: number; matched_count: number; matched_cost: string | null; unmatched_count: number }>(`select count(*)::int as requests,
      count(*) filter(where status='completed')::int as completed,count(*) filter(where status='failed')::int as failed,
      count(*) filter(where status in ('submitting','processing','unknown'))::int as pending,
      count(*) filter(where ${verified})::int as matched_count,
      sum(provider_cost) filter(where ${verified})::text as matched_cost,
      count(*) filter(where not coalesce((${verified}),false))::int as unmatched_count
      from business_generations where ${where}`, params),
    sql.query<{ model: string }>("select distinct model from business_generations where account_id=$1 and user_id=$2 and ($3::boolean or nsfw=false) order by model limit 500", [account.id, user.id, adult]),
  ]);
  const stats = statistics.rows[0];
  if (!stats) throw new BusinessError("unavailable", 503);
  const total = Number(stats.requests);
  return { generations: jobs.rows.map(publicBusinessGeneration), models: models.rows.map(row => row.model),
    range: { from: filters.range.from, to: filters.range.to, timezone: "Asia/Taipei" },
    filters: { model: filters.model, status: filters.status, kind: filters.kind },
    pagination: { page: filters.page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), hasMore: filters.page * PAGE_SIZE < total },
    stats: { requests: total, completed: Number(stats.completed), failed: Number(stats.failed), pending: Number(stats.pending),
      matchedCost: Number(stats.matched_count) ? stats.matched_cost : null, currency: "USD", unmatchedCount: Number(stats.unmatched_count) } };
}
