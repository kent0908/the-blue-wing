"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell, Field, SubmitButton } from "@/components/AuthUI";
import { useT } from "@/lib/i18n/client";

export default function ForgotPasswordPage() {
  const t = useT();
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
        setError(json?.error?.message || t.auth.sendFailed);
        return;
      }
      setDone(true);
      setDevUrl(json?.devResetUrl ?? null);
    } catch {
      setError(t.auth.network);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={t.auth.forgotTitle}
      foot={<Link href="/login" className="text-[#7ff0cd] hover:underline">{t.auth.backLogin}</Link>}
    >
      {done ? (
        <div className="space-y-3 text-[13px] leading-relaxed text-[#c9c9c9]">
          <p className="text-[#7ff0cd]">{t.auth.forgotSent}</p>
          {devUrl && (
            <p className="break-all text-[12px] text-[#8a8a8a]">
              {t.auth.testMode}<br />
              <Link href={devUrl.replace(/^https?:\/\/[^/]+/, "")} className="text-[#7ff0cd] hover:underline">{devUrl}</Link>
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-[12.5px] leading-relaxed text-[#8a8a8a]">
            {t.auth.forgotHint}
          </p>
          <Field label="Email" type="email" value={email} onChange={setEmail} autoFocus />
          {error && <p className="text-[12.5px] leading-relaxed text-[#ff9b9b]">{error}</p>}
          <SubmitButton busy={busy} disabled={!email}>{t.auth.sendReset}</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
