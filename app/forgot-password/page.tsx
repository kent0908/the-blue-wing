"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell, Field, SubmitButton } from "@/components/AuthUI";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error?.message || "送出失敗");
        return;
      }
      setDone(true);
      setDevUrl(json?.devResetUrl ?? null);
    } catch {
      setError("連線失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="忘記密碼"
      foot={<Link href="/login" className="text-[#7ff0cd] hover:underline">回登入</Link>}
    >
      {done ? (
        <div className="space-y-3 text-[13px] leading-relaxed text-[#c9c9c9]">
          <p className="text-[#7ff0cd]">如果這個 email 有註冊，我們已寄出重設連結（1 小時內有效）。請收信。</p>
          {devUrl && (
            <p className="break-all text-[12px] text-[#8a8a8a]">
              （測試模式，未設寄信服務）重設連結：<br />
              <Link href={devUrl.replace(/^https?:\/\/[^/]+/, "")} className="text-[#7ff0cd] hover:underline">{devUrl}</Link>
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-[12.5px] leading-relaxed text-[#8a8a8a]">
            輸入註冊時用的 email，我們會寄一封重設密碼的連結給你。
          </p>
          <Field label="Email" type="email" value={email} onChange={setEmail} autoFocus />
          {error && <p className="text-[12.5px] leading-relaxed text-[#ff9b9b]">{error}</p>}
          <SubmitButton busy={busy} disabled={!email}>寄出重設連結</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
