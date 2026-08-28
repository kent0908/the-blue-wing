/**
 * Transactional email via Resend's REST API (no SDK).
 *
 * If RESEND_API_KEY is not set, the message is logged to the server console
 * instead and the caller gets `{ sent: false }` — the action link is also
 * returned to the client in that case so you can test end-to-end before wiring
 * a real mail provider. Set MAIL_FROM to a verified sender once ready.
 */
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface MailResult {
  sent: boolean;
}

function shell(heading: string, body: string, url: string, cta: string): string {
  return `
    <div style="font-family:system-ui,sans-serif;line-height:1.6">
      <h2>${heading}</h2>
      ${body}
      <p><a href="${url}" style="display:inline-block;background:#2f8fe0;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${cta}</a></p>
      <p style="color:#666;font-size:13px">若按鈕無法點擊，複製此網址開啟：<br>${url}</p>
    </div>`;
}

async function send(to: string, subject: string, html: string, logLabel: string, url: string): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || "The Blue Wing <onboarding@resend.dev>";

  if (!key) {
    console.log(`[mail] RESEND_API_KEY not set — ${logLabel} for ${to}: ${url}`);
    return { sent: false };
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    throw new Error(`寄信失敗：${(await res.text()).slice(0, 200)}`);
  }
  return { sent: true };
}

export function sendVerifyEmail(to: string, verifyUrl: string): Promise<MailResult> {
  return send(
    to,
    "驗證你的 The Blue Wing 帳號",
    shell("歡迎加入 The Blue Wing", "<p>點下面的按鈕完成 email 驗證（連結 1 小時內有效）：</p>", verifyUrl, "驗證帳號"),
    "verify link",
    verifyUrl
  );
}

export function sendResetEmail(to: string, resetUrl: string): Promise<MailResult> {
  return send(
    to,
    "重設你的 The Blue Wing 密碼",
    shell(
      "重設密碼",
      "<p>我們收到重設此帳號密碼的請求。點下面的按鈕設定新密碼（連結 1 小時內有效）：</p><p style=\"color:#666;font-size:13px\">如果不是你本人操作，請忽略這封信，密碼不會變更。</p>",
      resetUrl,
      "重設密碼"
    ),
    "reset link",
    resetUrl
  );
}
