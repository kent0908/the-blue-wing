/**
 * One-time wiring for the Telegram 小助手.
 *
 *   node scripts/telegram-setup.mjs discover   # print chat ids that have messaged the bot
 *   node scripts/telegram-setup.mjs webhook    # register the webhook + command menu on the live site
 *   node scripts/telegram-setup.mjs test       # send a hello to TELEGRAM_ADMIN_CHAT_ID
 *
 * Reads TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_ADMIN_CHAT_ID
 * and SITE_URL (default https://thebluewing.studio) from the environment or
 * .env.local. Never prints the token.
 */
import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const token = process.env.TELEGRAM_BOT_TOKEN;
const site = (process.env.SITE_URL || "https://thebluewing.studio").replace(/\/$/, "");
const mode = process.argv[2] || "help";
if (!token) {
  console.error("缺少 TELEGRAM_BOT_TOKEN（到 Telegram 找 @BotFather → /newbot 取得）。");
  process.exit(1);
}
const api = async (method, payload = {}) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  return json.result;
};

const me = await api("getMe");
console.log(`Bot：@${me.username}`);

if (mode === "discover") {
  // getUpdates only works while no webhook is set — take it down for the look-up.
  await api("deleteWebhook", { drop_pending_updates: false });
  const updates = await api("getUpdates", { limit: 50, allowed_updates: ["message"] });
  const chats = new Map();
  for (const u of updates) if (u.message?.chat) chats.set(String(u.message.chat.id), u.message.chat);
  if (!chats.size) console.log(`還沒有人跟 bot 說過話：先在 Telegram 打開 https://t.me/${me.username}，按 Start 或送一句話，再跑一次。`);
  for (const [id, c] of chats) console.log(`chat id ${id}  (${c.type}${c.username ? " @" + c.username : ""}${c.title ? " " + c.title : ""}${c.first_name ? " " + c.first_name : ""})`);
  console.log("把要收報表的 chat id 設成 Vercel 環境變數 TELEGRAM_ADMIN_CHAT_ID，然後跑 `webhook` 模式。");
} else if (mode === "webhook") {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    console.error("缺少 TELEGRAM_WEBHOOK_SECRET（隨機字串，同時要設到 Vercel）。");
    process.exit(1);
  }
  await api("setWebhook", { url: `${site}/api/telegram/webhook`, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true });
  await api("setMyCommands", {
    commands: [
      { command: "report", description: "今日至今的即時數字" },
      { command: "daily", description: "某一天的日報（預設昨天）" },
      { command: "week", description: "近 7 天摘要" },
      { command: "users", description: "人數總覽" },
      { command: "status", description: "服務健康與最近告警" },
      { command: "alerts", description: "立刻執行告警掃描" },
      { command: "help", description: "指令說明" },
    ],
  });
  const info = await api("getWebhookInfo");
  console.log(`Webhook：${info.url}${info.last_error_message ? `（上次錯誤：${info.last_error_message}）` : ""}`);
} else if (mode === "test") {
  const chat = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chat) {
    console.error("缺少 TELEGRAM_ADMIN_CHAT_ID（用 discover 模式查）。");
    process.exit(1);
  }
  await api("sendMessage", { chat_id: chat, text: "✅ The Blue Wing 小助手測試訊息：設定完成。", parse_mode: "HTML" });
  console.log("已送出測試訊息。");
} else {
  console.log("用法：node scripts/telegram-setup.mjs discover | webhook | test");
}
