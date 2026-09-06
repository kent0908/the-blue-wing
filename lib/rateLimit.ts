import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { sql } from "./db";
export async function limitRequest(key:string,limit:number,seconds:number) {
  const hash=createHash("sha256").update(key).digest("hex");
  const bucket=Math.floor(Date.now()/1000/seconds);
  const {rows}=await sql.query(
    "INSERT INTO api_limits(key,bucket,hits) VALUES($1,$2,1) ON CONFLICT(key) DO UPDATE SET bucket=EXCLUDED.bucket,hits=CASE WHEN api_limits.bucket=EXCLUDED.bucket THEN api_limits.hits+1 ELSE 1 END RETURNING hits",[hash,bucket]);
  return Number(rows[0].hits)<=limit;
}
export async function authLimit(req:NextRequest) {
  // Vercel replaces x-real-ip. Outside Vercel use one shared bucket, never arbitrary forwarded headers.
  const ip=process.env.VERCEL ? req.headers.get("x-real-ip") || "unknown" : "local";
  try {
    if(await limitRequest("auth:"+ip,30,60))return null;
    return NextResponse.json({error:{message:"操作太頻繁，請稍後再試"}},{status:429,headers:{"Retry-After":"60"}});
  } catch {
    return NextResponse.json({error:{message:"驗證服務暫時無法使用"}},{status:503});
  }
}
