import { NextRequest, NextResponse } from "next/server";
import { adminChatId, esc, sendTelegram } from "@/lib/telegram";
import { dailyReportText, runAlertScan, statusText, taipeiDate, todayReportText } from "@/lib/telegramReport";
import { overview } from "@/lib/crmReports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/telegram/webhook — Telegram pushes every message here.
 *
 * Trust model: the request must carry the secret Telegram was given at
 * setWebhook time (X-Telegram-Bot-Api-Secret-Token), and commands are only
 * honoured from TELEGRAM_ADMIN_CHAT_ID. Any other chat gets its own chat id
 * back on /start (so the owner can copy it into the env var) and nothing
 * else — the bot never leaks numbers to strangers.
 *
 * Always answers 200: Telegram retries non-2xx responses, which would turn
 * one bad update into a loop.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let update: { message?: { chat?: { id?: number | string; type?: string }; text?: string } } | null = null;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  const msg = update?.message;
  const chat = msg?.chat?.id !== undefined ? String(msg.chat.id) : "";
  const text = (msg?.text ?? "").trim();
  if (!chat || !text.startsWith("/")) return NextResponse.json({ ok: true });
  const command = text.split(/[\s@]/)[0].toLowerCase();
  const arg = text.slice(command.length).replace(/^@\S+/, "").trim();

  if (chat !== adminChatId()) {
    if (command === "/start" || command === "/id") {
      await sendTelegram(`這個聊天的 chat id 是 <code>${esc(chat)}</code>。\n把它設成 Vercel 的 <code>TELEGRAM_ADMIN_CHAT_ID</code> 後，重新部署即可開始接收報表。`, { chatId: chat });
    }
    return NextResponse.json({ ok: true });
  }

  try {
    const reply = await handle(command, arg);
    if (reply) await sendTelegram(reply, { chatId: chat });
  } catch (err) {
    await sendTelegram(`⚠️ 指令執行失敗：${esc(err instanceof Error ? err.message : "未知錯誤")}`, { chatId: chat });
  }
  return NextResponse.json({ ok: true });
}

async function handle(command: string, arg: string): Promise<string> {
  switch (command) {
    case "/start":
    case "/help":
      return [
        "🪽 <b>The Blue Wing 小助手</b>",
        "/report — 今日至今的即時數字",
        "/daily [YYYY-MM-DD] — 某一天的日報（預設昨天）",
        "/week — 近 7 天摘要",
        "/users — 人數總覽",
        "/status — 服務健康與最近告警",
        "/alerts — 立刻執行告警掃描",
        "",
        "每天 09:00（台北）會自動送昨日日報；異常會即時通知。",
      ].join("\n");
    case "/report":
      return todayReportText();
    case "/daily": {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : taipeiDate(-1);
      return dailyReportText(date);
    }
    case "/week": {
      const o = await overview(7);
      const t = o.totals;
      return [
        `📅 <b>近 7 天（${esc(o.period.from)} ～ ${esc(o.period.to)}）</b>`,
        `新註冊 ${t.newUsers} · 生成 ${t.generations} 次`,
        `會員消耗 ${t.customerCreditsSpent} 點 ≈ $${t.revenueEstUsd.toFixed(2)} · 發放面額 $${t.revenueCashUsd.toFixed(2)}`,
        `成本 ${t.costUsd === null ? "尚有未知" : "$" + t.costUsd.toFixed(4)} · 估算差額 ${t.profitUsd === null ? "—" : "$" + t.profitUsd.toFixed(2)}`,
        `每日活躍：${o.series.map((p) => p.activeUsers).join(" / ")}`,
      ].join("\n");
    }
    case "/users": {
      const o = await overview(1);
      const u = o.users;
      return [
        `👥 <b>人數總覽</b>`,
        `累計 ${u.total} · 已驗證 ${u.verified} · 付費方案 ${u.paid} · 停權 ${u.banned}`,
        `今日新增 ${u.today} · 7 天 ${u.d7} · 30 天 ${u.d30}`,
        `DAU ${u.dau} · WAU ${u.wau} · MAU ${u.mau}`,
      ].join("\n");
    }
    case "/status":
      return statusText();
    case "/alerts": {
      const findings = await runAlertScan();
      return findings.length ? `🔎 掃描完成，${findings.length} 項需要注意：\n${findings.map((f) => `• ${esc(f)}`).join("\n")}` : "✅ 掃描完成，沒有異常。";
    }
    default:
      return "不認識這個指令，輸入 /help 看看有哪些。";
  }
}
