import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { sql } from "@/lib/db";
import { reportRange } from "@/lib/crmRange";
import { errorResponse } from "@/lib/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const metrics = `count(*)::int as attempts, count(distinct request_id)::int as requests,
 count(*) filter(where attempt>1)::int as retries,
 count(*) filter(where http_status between 200 and 299)::int as success,
 count(*) filter(where http_status=400)::int as bad_request,
 count(*) filter(where http_status between 400 and 499)::int as client_error,
 count(*) filter(where http_status between 500 and 599)::int as server_error,
 count(*) filter(where http_status between 100 and 199 or http_status between 300 and 399)::int as other_http,
 count(*) filter(where outcome='timeout')::int as timeout,
 count(*) filter(where outcome='network_error')::int as network_error,
 count(*) filter(where outcome='cancelled')::int as cancelled,
 round(avg(duration_ms))::float8 as avg_ms`;
const where = `from model_request_events where created_at >= $1::timestamptz and created_at < $2::timestamptz and ($3::text is null or lower(model)=lower($3))`;
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req); if ("error" in auth) return auth.error;
  try {
    const search = req.nextUrl.searchParams;
    const days = Number(search.get("days") ?? 30);
    const model = search.get("model")?.trim() || null;
    if (!Number.isInteger(days) || days < 1 || days > 366 || (model && model.length > 160)) return NextResponse.json({error:{message:"篩選條件不正確"}},{status:400});
    let period;
    try {period=reportRange(days,search.get("from") || undefined,search.get("to") || undefined);} catch(e) {return NextResponse.json({error:{message:e instanceof Error ? e.message : "日期不正確"}},{status:400});}
    const params = [period.since,period.until,model];
    const [totals, statuses, models, series, options, coverage] = await Promise.all([
      sql.query(`select ${metrics} ${where}`,params),
      sql.query(`select http_status, outcome, count(*)::int as count ${where} group by http_status,outcome order by http_status nulls last,outcome`,params),
      sql.query(`select model,string_agg(distinct provider, ', ') as provider,${metrics} ${where} group by model order by attempts desc,model`,params),
      sql.query(`select to_char(created_at at time zone 'Asia/Taipei','YYYY-MM-DD') as date,${metrics} ${where} group by 1 order by 1`,params),
      sql.query(`select model from model_request_events union select model_id as model from model_rates order by model`),
      sql.query(`select min(created_at) as first_recorded_at from model_request_events`),
    ]);
    return NextResponse.json({period:{from:period.from,to:period.to},model,totals:totals.rows[0],statuses:statuses.rows,models:models.rows,series:series.rows,options:options.rows.map(r=>r.model),firstRecordedAt:coverage.rows[0]?.first_recorded_at ?? null});
  } catch(e) {return errorResponse(e);}
}
