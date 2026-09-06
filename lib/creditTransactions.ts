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
/**
 * Reserve before paid I/O, refund automatically if the call itself throws.
 *
 * Used to only auto-refund a SirayaApiError in the 4xx range — the reasoning
 * ("unknown provider outcome remains debited for reconciliation") makes
 * sense for a genuinely async job whose completion can still be reconciled
 * later (video's own /api/videos/[id] route does exactly that, separately,
 * when SIRAYA itself reports "failed"). But every one of these calls
 * (image, image-edit, text, and the video *submission* request itself) is a
 * single synchronous round trip: if it throws — a real 5xx from SIRAYA, a
 * network failure, a timeout, a malformed response — there is no async job
 * to reconcile against later and no other code path that will ever refund
 * this charge. A real user report (2026-09-06: "扣款但沒有任何影片生成成功")
 * plus a code audit turned up exactly this gap — leaving a 5xx/network
 * failure un-refunded meant a permanent, unrecoverable credit loss for a
 * request that (as far as we can tell) was never fulfilled. Refunding on
 * ANY thrown error, regardless of status/type, is the safer default: the
 * small risk of refunding a request SIRAYA secretly did fulfill (we'd have
 * no way to serve that result to the user anyway, since we only get it via
 * this same response) is far better than guaranteed, silent credit loss.
 *
 * Returns the ledger row id alongside the result so a caller can also
 * refund explicitly for its OWN kind of "no exception, but nothing usable
 * came back" case (e.g. an empty image array from a moderation soft-block) —
 * paidCall can't know what "usable" means for every kind, so that decision
 * stays with the caller.
 */
export async function paidCall<T>(userId:number,cost:number,kind:string,ref:string,call:()=>Promise<T>):Promise<{result:T,chargeId:string}> {
  if(!Number.isSafeInteger(cost)||cost<=0)throw new SirayaApiError(400,"無效的計費數量");
  const chargeId=await creditTransaction(userId,async c=>{
    if(await ledgerBalance(c,userId)<cost)throw new SirayaApiError(402,"點數不足，其他生成可能已預扣點數");
    const {rows}=await c.query("INSERT INTO credit_ledger(user_id,delta,reason,ref) VALUES($1,$2,$3,$4) RETURNING id",[userId,-cost,kind,kind==="video"?"pending:"+randomUUID():ref]);
    return String(rows[0].id);
  });
  let result:T;
  try {result=await call();} catch(e) {
    await refundCharge(userId,chargeId);
    throw e;
  }
  if(kind==="video") {
    const id=(result as {id?:unknown})?.id;
    if(id)await sql.query("UPDATE credit_ledger SET ref=$1 WHERE id=$2 AND user_id=$3",[String(id),chargeId,userId]);
  }
  return {result,chargeId};
}

