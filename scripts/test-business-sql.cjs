/** Real PostgreSQL constraints, using synthetic rows in one transaction that is always rolled back. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
process.env.POSTGRES_URL ||= process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
const { sql } = require('@vercel/postgres');
const ids = { a: randomUUID(), b: randomUUID(), credential: randomUUID(), otherCredential: randomUUID(), job: randomUUID(), request: randomUUID() };
let assertionCount = 0;

(async () => {
  const client = await sql.connect();
  let begun = false;
  let complete = false;
  let serial = 0;
  async function constraint(text, params, expectedCode) {
    const name = `business_fixture_${++serial}`;
    await client.query(`SAVEPOINT ${name}`);
    let code;
    try { await client.query(text, params); }
    catch (error) { code = error.code; }
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    await client.query(`RELEASE SAVEPOINT ${name}`);
    assert.equal(code, expectedCode, `expected database constraint ${expectedCode}`);
    assertionCount++;
  }
  try {
    await client.query('BEGIN'); begun = true;
    const now = await client.query(`select column_name,datetime_precision from information_schema.columns where table_schema='public' and table_name='business_accounts' and column_name='updated_at'`);
    assert.equal(now.rows[0]?.datetime_precision, 3, 'API ISO timestamps retain the exact database version'); assertionCount++;
    const users = await client.query(`insert into users(email,password_hash,email_verified,role,status)
      values($1,'unusable-rollback-fixture',false,'user','active'),($2,'unusable-rollback-fixture',false,'user','active') returning id`,
    [`business-fixture-${ids.a}@example.invalid`, `business-fixture-${ids.b}@example.invalid`]);
    const firstUser = users.rows[0].id;
    const secondUser = users.rows[1].id;
    await client.query(`insert into business_accounts(id,user_id,company_name,use_case,status) values
      ($1,$2,'Rollback studio A','Synthetic schema ownership validation','pending'),
      ($3,$4,'Rollback studio B','Synthetic schema ownership validation','pending')`, [ids.a, firstUser, ids.b, secondUser]);
    await constraint("insert into business_accounts(id,user_id,company_name,use_case) values($1,$2,'Duplicate','Synthetic duplicate application')", [randomUUID(), firstUser], '23505');
    await constraint("update business_accounts set status='admin' where id=$1", [ids.a], '23514');

    const version = (await client.query('select updated_at from business_accounts where id=$1 for update', [ids.a])).rows[0].updated_at;
    const expectedVersion = new Date(version).toISOString();
    const changed = await client.query(`update business_accounts set status='approved',
      updated_at=greatest(date_trunc('milliseconds',clock_timestamp()),updated_at+interval '1 millisecond')
      where id=$1 and updated_at=$2::timestamptz returning updated_at`, [ids.a, expectedVersion]);
    assert.equal(changed.rows.length, 1, 'exact API version can update the intended record'); assertionCount++;
    const nextVersion = new Date(changed.rows[0].updated_at).toISOString();
    assert.ok(Date.parse(nextVersion) > Date.parse(expectedVersion), 'versions increase even within the same clock millisecond'); assertionCount++;
    const stale = await client.query("update business_accounts set status='rejected' where id=$1 and updated_at=$2::timestamptz returning id", [ids.a, expectedVersion]);
    assert.equal(stale.rows.length, 0, 'a stale API version cannot update the newer account'); assertionCount++;
    const envelope = JSON.stringify({ v: 1, iv: 'synthetic', tag: 'synthetic', ciphertext: 'not-a-key' });
    await client.query(`insert into business_credentials(id,account_id,user_id,label,last_four,secret_envelope)
      values($1,$2,$3,'Rollback fixture','0000',$4::jsonb)`, [ids.credential, ids.a, firstUser, envelope]);
    await constraint(`insert into business_credentials(id,account_id,user_id,label,last_four,secret_envelope,is_active)
      values($1,$2,$3,'Wrong owner','0000',$4::jsonb,false)`, [randomUUID(), ids.a, secondUser, envelope], '23503');
    await constraint(`insert into business_credentials(id,account_id,user_id,label,last_four,secret_envelope)
      values($1,$2,$3,'Second active key','0000',$4::jsonb)`, [randomUUID(), ids.a, firstUser, envelope], '23505');
    await constraint('update business_credentials set revoked_at=now(),is_active=false where id=$1', [ids.credential], '23514');
    await client.query('update business_credentials set is_active=false where id=$1', [ids.credential]);
    await client.query(`insert into business_credentials(id,account_id,user_id,label,last_four,secret_envelope)
      values($1,$2,$3,'Rotated fixture','0000',$4::jsonb)`, [ids.otherCredential, ids.a, firstUser, envelope]);
    const active = await client.query('select count(*)::int as count from business_credentials where account_id=$1 and is_active and revoked_at is null', [ids.a]);
    assert.equal(active.rows[0].count, 1, 'rotation permits exactly one active version'); assertionCount++;

    await client.query(`insert into business_generations(id,account_id,user_id,credential_id,client_request_id,kind,model,prompt,status)
      values($1,$2,$3,$4,$5,'text','fixture-not-a-real-model','Synthetic rollback job','unknown')`, [ids.job, ids.a, firstUser, ids.credential, ids.request]);
    await constraint(`insert into business_generations(id,account_id,user_id,credential_id,client_request_id,kind,model,prompt,status)
      values($1,$2,$3,$4,$5,'text','fixture-not-a-real-model','Synthetic duplicate job','submitting')`, [randomUUID(), ids.a, firstUser, ids.otherCredential, ids.request], '23505');
    await constraint(`insert into business_generations(id,account_id,user_id,credential_id,client_request_id,kind,model,prompt,status)
      values($1,$2,$3,$4,$5,'text','fixture-not-a-real-model','Synthetic wrong owner','submitting')`, [randomUUID(), ids.b, secondUser, ids.credential, randomUUID()], '23503');
    await constraint('delete from business_credentials where id=$1', [ids.credential], '23503');
    await client.query(`update business_credentials set is_active=false,revoked_at=now(),secret_envelope=null where account_id=$1 and user_id=$2`, [ids.a, firstUser]);
    const revoked = await client.query('select count(*)::int as count from business_credentials where account_id=$1 and (is_active or revoked_at is null or secret_envelope is not null)', [ids.a]);
    assert.equal(revoked.rows[0].count, 0, 'explicit deletion can erase every encrypted historical version without deleting job provenance'); assertionCount++;
    const job = await client.query('select credential_id,status from business_generations where id=$1', [ids.job]);
    assert.equal(job.rows[0].credential_id, ids.credential); assertionCount++;
    assert.equal(job.rows[0].status, 'unknown'); assertionCount++;
    await client.query("insert into business_audit_events(account_id,actor_user_id,action,details) values($1,$2,'rollback_fixture','{}'::jsonb)", [ids.a, firstUser]);
    complete = true;
  } finally {
    if (begun) await client.query('ROLLBACK');
    try {
      if (complete) {
        const leftovers = await client.query(`select
          (select count(*) from business_accounts where id=any($1::uuid[]))::int as accounts,
          (select count(*) from business_credentials where account_id=any($1::uuid[]))::int as credentials,
          (select count(*) from business_generations where account_id=any($1::uuid[]))::int as jobs,
          (select count(*) from business_audit_events where account_id=any($1::uuid[]))::int as events,
          (select count(*) from users where email=any($2::text[]))::int as users`,
        [[ids.a, ids.b], [`business-fixture-${ids.a}@example.invalid`, `business-fixture-${ids.b}@example.invalid`]]);
        assert.deepEqual(leftovers.rows[0], { accounts: 0, credentials: 0, jobs: 0, events: 0, users: 0 }); assertionCount++;
      }
    } finally { client.release(); await sql.end(); }
  }
  console.log(`PASS ${assertionCount} real PostgreSQL business checks: owner composite FKs, one-account/active-key/request uniqueness, credential revocation/provenance, millisecond version accuracy/monotonic stale-write rejection, and zero fixture rows after ROLLBACK. No real user or role changes; no paid calls.`);
})().catch(error => { console.error('FAIL rollback-only business SQL checks:', error.code ?? error.name ?? 'unknown', error instanceof assert.AssertionError ? error.message : 'Database access or statement failed; connection details withheld.'); process.exitCode = 1; });
