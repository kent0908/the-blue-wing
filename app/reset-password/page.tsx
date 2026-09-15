"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell, Field, SubmitButton } from "@/components/AuthUI";
import { useT } from "@/lib/i18n/client";

function ResetInner() {
  const t = useT();
  const router = useRouter();
  const token = useSearchParams().get("token");

  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw !== confirm) {
      setError(t.auth.mismatch);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: pw }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error?.message || t.auth.resetFailed);
        return;
      }
      setOk(true);
      setTimeout(() => {
        router.push("/account");
        router.refresh();
      }, 900);
    } catch {
      setError(t.auth.network);
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title={t.auth.resetTitle} foot={<Link href="/forgot-password" className="text-[#7ff0cd] hover:underline">{t.auth.reapply}</Link>}>
        <p className="text-[13px] leading-relaxed text-[#ff9b9b]">{t.auth.missingToken}</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t.auth.resetTitle}
      foot={!ok ? <Link href="/login" className="text-[#7ff0cd] hover:underline">{t.auth.backLogin}</Link> : null}
    >
      {ok ? (
        <p className="text-[13px] leading-relaxed text-[#7ff0cd]">{t.auth.resetDone}</p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <Field label={t.auth.newPw} type="password" value={pw} onChange={setPw} autoFocus hint={t.auth.pwHint} />
          <Field label={t.auth.confirmPw} type="password" value={confirm} onChange={setConfirm} />
          {error && <p className="text-[12.5px] leading-relaxed text-[#ff9b9b]">{error}</p>}
          <SubmitButton busy={busy} disabled={!pw || !confirm}>{t.auth.setPw}</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthShell title="">{null}</AuthShell>}>
      <ResetInner />
    </Suspense>
  );
}
