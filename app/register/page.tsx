"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell, Field, SubmitButton } from "@/components/AuthUI";
import { useT } from "@/lib/i18n/client";

export default function RegisterPage() {
  const t = useT();
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
        setError(json?.error?.message || t.auth.registerFailed);
        return;
      }
      setDone({ needVerify: !!json.needVerify, devVerifyUrl: json.devVerifyUrl });
    } catch {
      setError(t.auth.network);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthShell
        title={t.auth.registered}
        foot={<Link href="/login" className="text-[#7ff0cd] hover:underline">{t.auth.toLogin}</Link>}
      >
        {done.needVerify ? (
          <div className="space-y-3 text-[13px] leading-relaxed text-[#c9c9c9]">
            <p>{t.auth.sentVerify} <span className="text-white">{email}</span>{t.auth.sentVerify2}</p>
            {done.devVerifyUrl && (
              <div className="rounded-lg border border-[#3a2e18] bg-[#241d10] p-3 text-[12px] text-[#f0c27f]">
                <p className="mb-1">{t.auth.noMail}</p>
                <a href={done.devVerifyUrl} className="break-all text-[#7ff0cd] hover:underline">{done.devVerifyUrl}</a>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-[#c9c9c9]">{t.auth.created}</p>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t.auth.registerTitle}
      foot={<>{t.auth.haveAccount}<Link href="/login" className="text-[#7ff0cd] hover:underline">{t.auth.login}</Link></>}
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email" type="email" value={email} onChange={setEmail} autoFocus />
        <Field label={t.auth.password} type="password" value={password} onChange={setPassword} hint={t.auth.pwHint} />
        {error && <p className="text-[12.5px] leading-relaxed text-[#ff9b9b]">{error}</p>}
        <SubmitButton busy={busy} disabled={!email || password.length < 8}>{t.auth.create}</SubmitButton>
      </form>
    </AuthShell>
  );
}
