"use client";

import { useState } from "react";
import { Card, Notice, btnCls, fieldCls, primaryBtnCls, useApi } from "@/components/crm/ui";

interface Settings {
  settings: { credit_value_usd: number; default_discount_pct: number; usd_to_twd: number };
  mail: { configured: boolean; from: string | null };
}

export default function CrmSettingsPage() {
  const { data, error, reload } = useApi<Settings>("/api/crm/settings");
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
              <div className="mb-1 text-[11.5px] text-[#8a8a8a]">每點的價值（USD）— 營收＝消耗點數 × 這個值</div>
              <input type="number" step="0.0001" min={0} value={form.credit_value_usd} onChange={(e) => setForm({ ...form, credit_value_usd: e.target.value })} className={`${fieldCls} w-[160px]`} />
              <div className="mt-1 text-[11px] text-[#6d6d6d]">點數包定價：500 點 $5（$0.01/點）… 100,000 點 $800（$0.008/點）。填你的平均實際售價。</div>
            </label>
            <label className="block">
              <div className="mb-1 text-[11.5px] text-[#8a8a8a]">預設折扣 %（沒有個別設定折扣的模型都套用）</div>
              <input type="number" step="0.5" min={0} max={100} value={form.default_discount_pct} onChange={(e) => setForm({ ...form, default_discount_pct: e.target.value })} className={`${fieldCls} w-[160px]`} />
            </label>
            <label className="block">
              <div className="mb-1 text-[11.5px] text-[#8a8a8a]">USD → TWD 匯率（只用於顯示）</div>
              <input type="number" step="0.01" min={0} value={form.usd_to_twd} onChange={(e) => setForm({ ...form, usd_to_twd: e.target.value })} className={`${fieldCls} w-[160px]`} />
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
      </div>
    </div>
  );
}
