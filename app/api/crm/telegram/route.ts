import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiauth";
import { errorResponse } from "@/lib/errors";
import { audit } from "@/lib/crm";
import { recentAlerts } from "@/lib/alerts";
import { adminChatId, esc, getBotInfo, sendTelegram, telegramConfigured } from "@/lib/telegram";
import { dailyReportText, runAlertScan, todayReportText } from "@/lib/telegramReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/crm/telegram — bot wiring status + recent alerts for the settings page. */
export async function GET(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;
  try {
    const bot = process.env.TELEGRAM_BOT_TOKEN ? await getBotInfo() : null;
    return NextResponse.json({
      configured: telegramConfigured(),
      tokenSet: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      chatSet: Boolean(adminChatId()),
      webhookSecretSet: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
      cronSecretSet: Boolean(process.env.CRON_SECRET),
      botUsername: bot?.username ?? null,
      alerts: await recentAlerts(10),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/crm/telegram — body { action: "test" | "daily" | "report" | "scan" } */
export async function POST(req: NextRequest) {
  const r = await requireAdmin(req);
  if ("error" in r) return r.error;
  try {
    const body = (await req.json().catch(() => null)) as { action?: string } | null;
    const action = body?.action;
    if (!telegramConfigured()) {
      return NextResponse.json({ sent: false, error: { message: "尚未設定 TELEGRAM_BOT_TOKEN / TELEGRAM_ADMIN_CHAT_ID（Vercel 環境變數）", code: "telegram_unconfigured" } }, { status: 503 });
    }
    let text: string;
    let findings: string[] = [];
    if (action === "test") text = `✅ <b>The Blue Wing 小助手已連上</b>\n由 ${esc(r.user.email)} 從 CRM 觸發的測試訊息。`;
    else if (action === "daily") text = await dailyReportText();
    else if (action === "report") text = await todayReportText();
    else if (action === "scan") {
      findings = await runAlertScan();
      text = findings.length ? `🔎 手動掃描：${findings.length} 項需要注意\n${findings.map((f) => `• ${esc(f)}`).join("\n")}` : "✅ 手動掃描：沒有異常。";
    } else return NextResponse.json({ error: { message: "未知的動作" } }, { status: 400 });
    const result = await sendTelegram(text);
    await audit(r.user.id, `telegram.${action}`, null, { sent: result.ok }, req.headers.get("x-forwarded-for"));
    if (!result.ok) return NextResponse.json({ sent: false, error: { message: result.error ?? "傳送失敗", code: "telegram_send_failed" } }, { status: 502 });
    return NextResponse.json({ sent: true, findings });
  } catch (err) {
    return errorResponse(err);
  }
}
