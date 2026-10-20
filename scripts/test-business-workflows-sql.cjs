/* Optional real PostgreSQL schema/CAS checks. TEMP tables + rollback; never touches customer data or paid APIs. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomBytes,randomUUID}=require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
process.env.POSTGRES_URL ||= process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
const {sql}=require('@vercel/postgres');
let verificationStep='connect';
(async()=>{
  const client=await sql.connect(),suffix=randomBytes(6).toString('hex');
  const accounts=`tbw_bwf_accounts_${suffix}`,workflows=`tbw_bwf_workflows_${suffix}`;
  const aid=randomUUID(),bid=randomUUID(),id=randomUUID(),uid='9007199254740992',foreignUid='9007199254740993';
  const version='1'.repeat(32),nextVersion='2'.repeat(32),graph=JSON.stringify({nodes:[],edges:[]});
  try{
    await client.query('BEGIN');
    verificationStep='create-temporary-accounts';
    await client.query(`create temporary table ${accounts}(id uuid not null,user_id bigint not null,primary key(id,user_id)) on commit drop`);
    const schema=fs.readFileSync(path.join(__dirname,'business-workflows.sql'),'utf8')
      .replaceAll('business_canvas_workflows',workflows).replaceAll('business_accounts',accounts)
      .replace('create table if not exists','create temporary table if not exists');
    verificationStep='create-temporary-workflow-schema';await client.query(schema);
    // Running the exact additive schema a second time must preserve existing table definitions.
    verificationStep='repeat-additive-workflow-schema';await client.query(schema);
    verificationStep='insert-temporary-account-fixtures';
    await client.query(`insert into ${accounts}(id,user_id) values($1,$2),($3,$4)`,[aid,uid,bid,foreignUid]);
    verificationStep='insert-temporary-workflow-fixture';await client.query(`insert into ${workflows}(id,account_id,user_id,name,graph,version) values($1,$2,$3,$4,$5::jsonb,$6)`,[id,aid,uid,'Original',graph,version]);
    const wrongOwner=await client.query(`select id from ${workflows} where id=$1 and account_id=$2 and user_id=$3`,[id,aid,foreignUid]);
    assert.equal(wrongOwner.rowCount,0);
    const wrongAccount=await client.query(`select id from ${workflows} where id=$1 and account_id=$2 and user_id=$3`,[id,bid,uid]);
    assert.equal(wrongAccount.rowCount,0);
    const accepted=await client.query(`update ${workflows} set name=$4,version=$5 where id=$1 and user_id=$2 and account_id=$3 and version=$6 returning user_id::text,name,version`,[id,uid,aid,'Winner',nextVersion,version]);
    assert.equal(accepted.rowCount,1);assert.equal(accepted.rows[0].user_id,uid);
    const stale=await client.query(`update ${workflows} set name=$4 where id=$1 and user_id=$2 and account_id=$3 and version=$5 returning id`,[id,uid,aid,'Stale writer',version]);
    assert.equal(stale.rowCount,0);
    const current=await client.query(`select name,version from ${workflows} where id=$1`,[id]);
    assert.deepEqual(current.rows[0],{name:'Winner',version:nextVersion});
    for(const [label,params,expected]of[
      ['cross-account owner mismatch',[randomUUID(),aid,foreignUid,'x',graph,version],'23503'],
      ['missing graph arrays',[randomUUID(),aid,uid,'x','{}',version],'23514'],
      ['malformed graph node shape',[randomUUID(),aid,uid,'x','{"nodes":null,"edges":[]}',version],'23514'],
      ['bad revision',[randomUUID(),aid,uid,'x',graph,'not-a-version'],'23514'],
    ]){
      await client.query('SAVEPOINT invalid_input');let code;
      try{await client.query(`insert into ${workflows}(id,account_id,user_id,name,graph,version) values($1,$2,$3,$4,$5::jsonb,$6)`,params);}catch(error){code=error.code;}
      await client.query('ROLLBACK TO SAVEPOINT invalid_input');assert.equal(code,expected,label);
    }
    await client.query('ROLLBACK');
    console.log('PASS real PostgreSQL business workflow schema: idempotent migration, exact bigint ownership, account isolation, optimistic CAS and FK/JSON/revision constraints. TEMP tables rolled back; no customer rows or paid calls.');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();await sql.end();}
})().catch(error=>{const safe=value=>typeof value==='string'&&/^[A-Za-z0-9_ -]{1,140}$/.test(value)?value:undefined;console.error('PostgreSQL business workflow verification failed; connection details withheld.',JSON.stringify({step:verificationStep,name:safe(error.name),code:safe(error.code),constraint:safe(error.constraint),routine:safe(error.routine)}));process.exitCode=1;});
