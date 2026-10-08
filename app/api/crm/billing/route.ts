import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { reportRange } from "@/lib/crmRange";
import { audit } from "@/lib/crm";
import { BillingError, validRequestId, fetchConsoleAccounts } from "@/lib/sirayaConsole";
import { billingCutoff, lookupSirayaBilling, sirayaBillingReport, syncSirayaBilling } from "@/lib/sirayaBilling";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=300;
const headers = {"Cache-Control":"private, no-store"};
function failure(error: unknown) {
  const e = error instanceof BillingError ? error : new BillingError("storage_failed",503);
  return NextResponse.json({error:{code:e.code,...(e.diagnostics?{schema:e.diagnostics}:{})}}, {status:e.status,headers:{...headers,...(e.retryAfter ? {"Retry-After":String(e.retryAfter)} : {})}});
}
export async function GET(req: NextRequest) {
  const auth=await requireAdmin(req); if("error" in auth)return auth.error;
  try {
    const q=req.nextUrl.searchParams;
    const page=Number(q.get("page") ?? "1"),model=q.get("model") ?? "",requestId=q.get("requestId") ?? "";
    if(!Number.isSafeInteger(page)||page<1||page>10000||model.length>160||(requestId&&!validRequestId(requestId)))throw new BillingError("invalid_filters",400);
    let range;
    try { range=billingCutoff(reportRange(30,q.get("from")||undefined,q.get("to")||undefined)); }
    catch { throw new BillingError("invalid_dates",400); }
    return NextResponse.json({...await sirayaBillingReport(range,model,page,requestId),range}, {headers});
  } catch(e){return failure(e);}
}
export async function POST(req: NextRequest) {
  const auth=await requireAdmin(req); if("error" in auth)return auth.error;
  if(req.headers.get("origin")!==req.nextUrl.origin)return failure(new BillingError("invalid_origin",403));
  try {
    const body=await req.json().catch(()=>null);
    if(!body||typeof body!=="object")throw new BillingError("invalid_filters",400);
    if(body.action==="accounts")return NextResponse.json({accounts:await fetchConsoleAccounts(AbortSignal.timeout(30000))},{headers});
    if(body.action==="lookup") {
      if(!validRequestId(body.requestId))throw new BillingError("invalid_request_id",400);
      const record=await lookupSirayaBilling(body.requestId);
      await audit(auth.user.id,"siraya_billing.lookup",null,{requestId:record.requestId});
      return NextResponse.json({record},{headers});
    }
    if(body.action!=="sync"||typeof body.from!=="string"||typeof body.to!=="string")throw new BillingError("invalid_dates",400);
    let range;
    try { range=billingCutoff(reportRange(30,body.from,body.to)); } catch {throw new BillingError("invalid_dates",400);}
    const result=await syncSirayaBilling(range,auth.user.id);
    await audit(auth.user.id,"siraya_billing.sync",null,result);
    return NextResponse.json({ok:true,...result},{headers});
  }catch(e){return failure(e);}
}
