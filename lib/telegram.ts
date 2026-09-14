/**
 * Telegram "小助手" transport — the one place that talks to the Bot API.
 *
 * Env (Vercel → Settings → Environment Variables):
 *   TELEGRAM_BOT_TOKEN      from @BotFather
 *   TELEGRAM_ADMIN_CHAT_ID  the chat (your private chat with the bot, or a
 *                           group) that receives reports and alerts; the
 *                           webhook only obeys commands from this chat
 *   TELEGRAM_WEBHOOK_SECRET random string; Telegram echoes it back in the
 *                           X-Telegram-Bot-Api-Secret-Token header so the
 *                           webhook can tell real updates from strangers
 *
 * Everything here is fire-and-forget safe: sendTelegram never throws, so a
 * broken bot can never take a generation or a report down with it.
 */

const API = "https://api.telegram.org";
const MAX_LEN = 4000; // Telegram caps a message at 4096 UTF-16 units

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID);
}

export function adminChatId(): string {
  return (process.env.TELEGRAM_ADMIN_CHAT_ID ?? "").trim();
}

/** HTML parse mode — escape anything user-controlled or free-form. */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

async function callBot(method: string, payload: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN 未設定" };
  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: unknown; description?: string } | null;
    if (!json || typeof json !== "object") return { ok: false, description: `Telegram 回應非預期（HTTP ${res.status}）` };
    return { ok: json.ok === true, result: json.result, description: json.description };
  } catch (err) {
    return { ok: false, description: err instanceof Error ? err.message : "連線失敗" };
  }
}

/** Splits on line breaks so a long report never lands cut mid-tag. */
function chunk(text: string): string[] {
  if (text.length <= MAX_LEN) return [text];
  const out: string[] = [];
  let buf = "";
  for (const line of text.split("\n")) {
    if (buf.length + line.length + 1 > MAX_LEN) {
      out.push(buf);
      buf = "";
    }
    buf += (buf ? "\n" : "") + line;
  }
  if (buf) out.push(buf);
  return out;
}

/** Sends an HTML-formatted message to the admin chat (or an explicit chat). Never throws. */
export async function sendTelegram(text: string, opts: { chatId?: string; silent?: boolean } = {}): Promise<SendResult> {
  const chat = opts.chatId ?? adminChatId();
  if (!chat) return { ok: false, error: "TELEGRAM_ADMIN_CHAT_ID 未設定" };
  for (const part of chunk(text)) {
    const r = await callBot("sendMessage", { chat_id: chat, text: part, parse_mode: "HTML", disable_web_page_preview: true, disable_notification: opts.silent === true });
    if (!r.ok) return { ok: false, error: r.description ?? "傳送失敗" };
  }
  return { ok: true };
}

export async function getBotInfo(): Promise<{ username: string } | null> {
  const r = await callBot("getMe", {});
  const u = (r.result as { username?: string } | undefined)?.username;
  return r.ok && u ? { username: u } : null;
}

export async function setWebhook(url: string, secret: string): Promise<SendResult> {
  const r = await callBot("setWebhook", { url, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true });
  return r.ok ? { ok: true } : { ok: false, error: r.description };
}

export async function setCommands(commands: { command: string; description: string }[]): Promise<SendResult> {
  const r = await callBot("setMyCommands", { commands });
  return r.ok ? { ok: true } : { ok: false, error: r.description };
}
