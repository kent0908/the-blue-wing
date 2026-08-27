/**
 * Transactional email via Resend's REST API (no SDK).
 *
 * If RESEND_API_KEY is not set, the message is logged to the server console
 * instead and the caller gets `{ sent: false }` — the verification link is
 * also returned to the client in that case so you can test end-to-end before
 * wiring a real mail provider. Set MAIL_FROM to a verified sender once ready.
 */
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface MailResult {
  sent: boolean;
}

export async function sendVerifyEmail(to: string, verifyUrl: string): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || "The Blue Wing <onboarding@resend.dev>";

  if (!key) {
    console.log(`[mail] RESEND_API_KEY not set — verify link for ${to}: ${verifyUrl}`);
    return { sent: false };
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: "驗證你的 The Blue Wing 帳號",
      html: `
        <div style="font-family:system-ui,sans-serif;line-height:1.6">
          <h2>歡迎加入 The Blue Wing</h2>
          <p>點下面的按鈕完成 email 驗證（連結 1 小時內有效）：</p>
          <p><a href="${verifyUrl}" style="display:inline-block;background:#2f8fe0;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">驗證帳號</a></p>
          <p style="color:#666;font-size:13px">若按鈕無法點擊，複製此網址開啟：<br>${verifyUrl}</p>
        </div>`,
    }),
  });

  if (!res.ok) {
    throw new Error(`寄送驗證信失敗：${(await res.text()).slice(0, 200)}`);
  }
  return { sent: true };
}
