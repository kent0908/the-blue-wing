"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell, Field, SubmitButton } from "@/components/AuthUI";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ needVerify: boolean; devVerifyUrl?: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error?.message || "註冊失敗");
        return;
      }
      setDone({ needVerify: !!json.needVerify, devVerifyUrl: json.devVerifyUrl });
    } catch {
      setError("連線失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthShell
        title="註冊成功"
        foot={<Link href="/login" className="text-[#7ff0cd] hover:underline">前往登入</Link>}
      >
        {done.needVerify ? (
          <div className="space-y-3 text-[13px] leading-relaxed text-[#c9c9c9]">
            <p>已寄出驗證信到 <span className="text-white">{email}</span>，點信裡的連結完成驗證後就能登入。</p>
            {done.devVerifyUrl && (
              <div className="rounded-lg border border-[#3a2e18] bg-[#241d10] p-3 text-[12px] text-[#f0c27f]">
                <p className="mb-1">目前尚未設定寄信服務（RESEND_API_KEY），先用這個連結驗證：</p>
                <a href={done.devVerifyUrl} className="break-all text-[#7ff0cd] hover:underline">{done.devVerifyUrl}</a>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-[#c9c9c9]">帳號已建立，可以直接登入。</p>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="註冊 The Blue Wing"
      foot={<>已經有帳號？<Link href="/login" className="text-[#7ff0cd] hover:underline">登入</Link></>}
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email" type="email" value={email} onChange={setEmail} autoFocus />
        <Field label="密碼" type="password" value={password} onChange={setPassword} hint="至少 8 個字元" />
        {error && <p className="text-[12.5px] leading-relaxed text-[#ff9b9b]">{error}</p>}
        <SubmitButton busy={busy} disabled={!email || password.length < 8}>建立帳號</SubmitButton>
      </form>
    </AuthShell>
  );
}
