"use client";

import { useState } from "react";
import { Card, Notice, btnCls, fieldCls, primaryBtnCls, useApi } from "@/components/crm/ui";

interface Settings {
  settings: { credit_value_usd: number; default_discount_pct: number; usd_to_twd: number };
  mail: { configured: boolean; from: string | null };
}
interface TelegramStatus {
  configured: boolean;
  tokenSet: boolean;
  chatSet: boolean;
  webhookSecretSet: boolean;
  cronSecretSet: boolean;
  botUsername: string | null;
  alerts: { key: string; title: string; level: string; detail: string; count: number; last_seen_at: string }[];
}

export default function CrmSettingsPage() {
  const { data, error, reload } = useApi<Settings>("/api/crm/settings");
  const { data: tg, reload: reloadTg } = useApi<TelegramStatus>("/api/crm/telegram");
  const [form, setForm] = useState({ credit_value_usd: "", default_discount_pct: "", usd_to_twd: "" });
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [seeded, setSeeded] = useState<Settings | null>(null);
  if (data && data !== seeded) {
    setSeeded(data);
    setForm({ credit_value_usd: String(data.settings.credit_value_usd), default_discount_pct: String(data.settings.default_discount_pct), usd_to_twd: String(data.settings.usd_to_twd) });
  }

  const save = async () => {
    setBusy("save");
    setMsg(null);
    try {
      const res = await fetch("/api/crm/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credit_value_usd: Number(form.credit_value_usd), default_discount_pct: Number(form.default_discount_pct), usd_to_twd: Number(form.usd_to_twd) }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || "儲存失敗");
      setMsg({ kind: "ok", text: "已儲存" });
      reload();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "儲存失敗" });
    } finally {
      setBusy(null);
    }
  };

  const mailTest = async () => {
    setBusy("mail");
    setMsg(null);
    try {
      const res = await fetch("/api/crm/mail-test", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.sent) throw new Error(j?.error?.message || "寄信失敗");
      setMsg({ kind: "ok", text: "測試信已送出，請到你的信箱確認（含垃圾郵件匣）。" });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "寄信失敗" });
    } finally {
      setBusy(null);
    }
  };

  const telegram = async (action: "test" | "daily" | "report" | "scan") => {
    setBusy(`tg-${action}`);
    setMsg(null);
    try {
      const res = await fetch("/api/crm/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.sent) throw new Error(j?.error?.message || "傳送失敗");
      setMsg({ kind: "ok", text: action === "scan" ? `掃描完成，${(j.findings ?? []).length} 項需要注意，結果已送到 Telegram。` : "已送到 Telegram，請到聊天視窗確認。" });
      reloadTg();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "傳送失敗" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold text-white">系統設定</h1>
        <p className="text-[12.5px] text-[#8a8a8a]">影響所有報表的換算參數，以及寄信服務狀態。</p>
      </div>
      {error && <Notice kind="err">{error}</Notice>}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="計價參數" sub="改動只影響之後的試算與報表顯示；歷史成本事件維持當時的快照">
          <div className="space-y-3 text-[12.5px]">
            <label className="block">
              <div className="mb-1 text-[11.5px] text-[#8a8a8a]">消耗面額估算單價（USD／點）</div>
              <input type="number" step="0.0001" min={0.0001} value={form.credit_value_usd} onChange={(e) => setForm({ ...form, credit_value_usd: e.target.value })} className={`${fieldCls} w-[160px]`} />
              <div className="mt-1 text-[11px] text-[#6d6d6d]">只影響管理報表的面額估算，不會修改方案售價或用戶扣點。消耗面額不等於實收營收；點數包有效單價為 $0.008–$0.01／點。</div>
            </label>
            <label className="block">
              <div className="mb-1 text-[11.5px] text-[#8a8a8a]">預設折扣 %（沒有個別設定折扣的模型都套用）</div>
              <input type="number" step="0.5" min={0} max={100} value={form.default_discount_pct} onChange={(e) => setForm({ ...form, default_discount_pct: e.target.value })} className={`${fieldCls} w-[160px]`} />
            </label>
            <label className="block">
              <div className="mb-1 text-[11.5px] text-[#8a8a8a]">USD → TWD 匯率（只用於顯示）</div>
              <input type="number" step="0.01" min={0.01} value={form.usd_to_twd} onChange={(e) => setForm({ ...form, usd_to_twd: e.target.value })} className={`${fieldCls} w-[160px]`} />
            </label>
            <button type="button" disabled={busy === "save"} onClick={() => void save()} className={primaryBtnCls}>
              {busy === "save" ? "儲存中…" : "儲存"}
            </button>
          </div>
        </Card>

        <Card title="寄信服務（忘記密碼 / 帳號驗證）" sub="使用 Resend。沒有設定時，忘記密碼與驗證信都不會送出。">
          <div className="space-y-3 text-[12.5px]">
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${data?.mail.configured ? "bg-[#7ff0cd]" : "bg-[#ff9b9b]"}`} />
              {data?.mail.configured ? `已設定（寄件者：${data.mail.from ?? "onboarding@resend.dev（Resend 測試寄件者）"}）` : "尚未設定 RESEND_API_KEY"}
            </div>
            {!data?.mail.configured && (
              <ol className="list-decimal space-y-1 pl-5 text-[12px] text-[#c9c9c9]">
                <li>到 resend.com 建立帳號，Domains 加入你的網域並完成 DNS 驗證（或先用測試寄件者）。</li>
                <li>API Keys 建立一把金鑰。</li>
                <li>Vercel 專案 → Settings → Environment Variables 新增 <code className="rounded bg-[#1c1c1c] px-1">RESEND_API_KEY</code>，以及 <code className="rounded bg-[#1c1c1c] px-1">MAIL_FROM</code>（例：The Blue Wing &lt;noreply@你的網域&gt;）。</li>
                <li>重新部署後回到這裡按「寄測試信」確認。</li>
              </ol>
            )}
            <button type="button" disabled={busy === "mail"} onClick={() => void mailTest()} className={btnCls}>
              {busy === "mail" ? "寄送中…" : "寄測試信到我的信箱"}
            </button>
            <div className="border-t border-[#1e1e1e] pt-3 text-[11.5px] leading-relaxed text-[#8a8a8a]">
              <div className="mb-1 font-medium text-[#c9c9c9]">安全設計</div>
              密碼以 scrypt 加鹽雜湊儲存，資料庫與後台都沒有明文；管理員只能「寄重設連結」給使用者本人（連結 1 小時有效、用過即失效，重設後所有裝置登出），無法直接看到或設定密碼。
              所有後台操作寫入稽核紀錄；後台 API 一律要求管理員身分並有速率限制；每位用戶有兩英文＋八位數字的 UID 供客服對照，不需揭露 email。
            </div>
          </div>
        </Card>

        <Card title="Telegram 小助手（日報 / 告警）" sub="每天 09:00（台北）自動送昨日的人數、金流、銷售與生成摘要；生成服務或素材服務出錯時即時通知。" className="lg:col-span-2">
          <div className="grid gap-4 text-[12.5px] lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${tg?.configured ? "bg-[#7ff0cd]" : "bg-[#ff9b9b]"}`} />
                {tg?.configured ? `已連上${tg.botUsername ? ` @${tg.botUsername}` : ""}` : "尚未完整設定"}
              </div>
              <ul className="space-y-1 text-[12px] text-[#c9c9c9]">
                <li>{tg?.tokenSet ? "✅" : "❌"} <code className="rounded bg-[#1c1c1c] px-1">TELEGRAM_BOT_TOKEN</code> — 向 @BotFather 用 /newbot 建立機器人取得</li>
                <li>{tg?.chatSet ? "✅" : "❌"} <code className="rounded bg-[#1c1c1c] px-1">TELEGRAM_ADMIN_CHAT_ID</code> — 先跟機器人說 /start，它會回你 chat id（或跑 <code className="rounded bg-[#1c1c1c] px-1">node scripts/telegram-setup.mjs discover</code>）</li>
                <li>{tg?.webhookSecretSet ? "✅" : "❌"} <code className="rounded bg-[#1c1c1c] px-1">TELEGRAM_WEBHOOK_SECRET</code> — 任意隨機字串；設好後跑 <code className="rounded bg-[#1c1c1c] px-1">node scripts/telegram-setup.mjs webhook</code> 讓指令生效</li>
                <li>{tg?.cronSecretSet ? "✅" : "❌"} <code className="rounded bg-[#1c1c1c] px-1">CRON_SECRET</code> — 任意隨機字串；Vercel 排程用它呼叫日報</li>
              </ul>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy !== null} onClick={() => void telegram("test")} className={btnCls}>{busy === "tg-test" ? "傳送中…" : "傳測試訊息"}</button>
                <button type="button" disabled={busy !== null} onClick={() => void telegram("daily")} className={btnCls}>{busy === "tg-daily" ? "傳送中…" : "現在送昨日日報"}</button>
                <button type="button" disabled={busy !== null} onClick={() => void telegram("report")} className={btnCls}>{busy === "tg-report" ? "傳送中…" : "送今日即時報表"}</button>
                <button type="button" disabled={busy !== null} onClick={() => void telegram("scan")} className={btnCls}>{busy === "tg-scan" ? "掃描中…" : "執行告警掃描"}</button>
              </div>
              <div className="text-[11.5px] leading-relaxed text-[#8a8a8a]">
                指令：/report 今日至今 · /daily 日報 · /week 近 7 天 · /users 人數 · /status 服務健康 · /alerts 立即掃描。只有上面設定的那個聊天能下指令。
              </div>
            </div>
            <div>
              <div className="mb-2 text-[11.5px] text-[#8a8a8a]">最近告警（同一類事件在冷卻時間內只通知一次，次數會累計）</div>
              {tg && tg.alerts.length === 0 && <div className="text-[12px] text-[#6d6d6d]">還沒有任何告警。</div>}
              <ul className="space-y-1.5">
                {tg?.alerts.map((a) => (
                  <li key={a.key} className="rounded-lg bg-[#161616] px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={a.level === "error" ? "text-[#ff9b9b]" : "text-[#f0c27f]"}>{a.title}</span>
                      <span className="text-[11px] text-[#8a8a8a]">×{a.count} · {new Date(a.last_seen_at).toLocaleString("zh-TW", { hour12: false })}</span>
                    </div>
                    {a.detail && <div className="mt-1 whitespace-pre-line text-[11.5px] text-[#a8a8a8]">{a.detail}</div>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
