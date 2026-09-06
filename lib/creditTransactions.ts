import type { VercelPoolClient } from "@vercel/postgres";
import { sql } from "./db";
import { replayCredits, type CreditEvent } from "./creditReplay";
import { SirayaApiError } from "./siraya";
import { randomUUID } from "node:crypto";

export async function creditTransaction<T>(userId:number, fn:(c:VercelPoolClient)=>Promise<T>):Promise<T> {
  const c=await sql.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[userId]);
    const result=await fn(c);
    await c.query("COMMIT");
    return result;
  } catch(e) {await c.query("ROLLBACK");throw e;} finally {c.release();}
}
export async function ledgerBalance(c:{query: (q:string,p:unknown[])=>Promise<{rows:unknown[]}>}, userId:number) {
  const result=await c.query("SELECT id,delta,reason,ref,created_at,expires_at FROM credit_ledger WHERE user_id=$1 ORDER BY created_at,id",[userId]);
  return replayCredits(result.rows as CreditEvent[]);
}
export async function refundCharge(userId:number, chargeId:string) {
  return creditTransaction(userId,async c=>{
    const {rows}=await c.query("SELECT * FROM credit_ledger WHERE id=$1 AND user_id=$2 AND delta<0",[chargeId,userId]);
    const charge=rows[0];
    if (!charge) return;
    const existing=await c.query("SELECT 1 FROM credit_ledger WHERE user_id=$1 AND ((reason='charge_refund' AND ref=$2) OR (reason='video_refund' AND ref=$3)) LIMIT 1",[userId,chargeId,charge.ref]);
    if(existing.rows.length)return;
    await c.query("INSERT INTO credit_ledger(user_id,delta,reason,ref) VALUES($1,$2,'charge_refund',$3)",[userId,-charge.delta,chargeId]);
  });
}
/** Reserve before paid I/O. Unknown provider outcome remains debited for reconciliation. */
export async function paidCall<T>(userId:number,cost:number,kind:string,ref:string,call:()=>Promise<T>):Promise<T> {
  if(!Number.isSafeInteger(cost)||cost<=0)throw new SirayaApiError(400,"無效的計費數量");
  const chargeId=await creditTransaction(userId,async c=>{
    if(await ledgerBalance(c,userId)<cost)throw new SirayaApiError(402,"點數不足，其他生成可能已預扣點數");
    const {rows}=await c.query("INSERT INTO credit_ledger(user_id,delta,reason,ref) VALUES($1,$2,$3,$4) RETURNING id",[userId,-cost,kind,kind==="video"?"pending:"+randomUUID():ref]);
    return String(rows[0].id);
  });
  let result:T;
  try {result=await call();} catch(e) {
    if(e instanceof SirayaApiError && e.status>=400 && e.status<500)await refundCharge(userId,chargeId);
    throw e;
  }
  if(kind==="video") {
    const id=(result as {id?:unknown})?.id;
    if(id)await sql.query("UPDATE credit_ledger SET ref=$1 WHERE id=$2 AND user_id=$3",[String(id),chargeId,userId]);
  }
  return result;
}

