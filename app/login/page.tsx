"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell, Field, SubmitButton } from "@/components/AuthUI";
import { useT } from "@/lib/i18n/client";

function LoginInner() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/studio?mode=image";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          json?.error?.code === "email_unverified"
            ? t.auth.unverified
            : json?.error?.message || t.auth.loginFailed
        );
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError(t.auth.network);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={t.auth.loginTitle}
      foot={<>{t.auth.noAccount}<Link href="/register" className="text-[#7ff0cd] hover:underline">{t.auth.register}</Link></>}
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email" type="email" value={email} onChange={setEmail} autoFocus />
        <Field label={t.auth.password} type="password" value={password} onChange={setPassword} />
        <div className="text-right">
          <Link href="/forgot-password" className="text-[12px] text-[#8a8a8a] hover:text-white">{t.auth.forgot}</Link>
        </div>
        {error && <p className="text-[12.5px] leading-relaxed text-[#ff9b9b]">{error}</p>}
        <SubmitButton busy={busy} disabled={!email || !password}>{t.auth.login}</SubmitButton>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthShell title="">{null}</AuthShell>}>
      <LoginInner />
    </Suspense>
  );
}
