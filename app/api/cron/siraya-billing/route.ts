import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { consoleConfig, BillingError } from "@/lib/sirayaConsole";
import { billingCutoff, syncSirayaBilling } from "@/lib/sirayaBilling";
import { reportRange } from "@/lib/crmRange";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;
export async function GET(req: NextRequest) {
  const secret=process.env.CRON_SECRET;
  const given=Buffer.from(req.headers.get("authorization")??"");
  const want=Buffer.from(`Bearer ${secret??""}`);
  if(!secret||given.length!==want.length||!timingSafeEqual(given,want))return NextResponse.json({error:{code:"unauthorized"}},{status:401});
  if(!consoleConfig().configured)return NextResponse.json({ok:false,code:"not_configured"});
  try {
    // Seven overlapping days catch delayed provider postings. Older months remain manually reconcilable.
    const result=await syncSirayaBilling(billingCutoff(reportRange(7)),null);
    return NextResponse.json({ok:true,...result});
  }catch(error){
    const e=error instanceof BillingError?error:new BillingError("storage_failed",503);
    return NextResponse.json({ok:false,error:{code:e.code}},{status:e.status});
  }
}
