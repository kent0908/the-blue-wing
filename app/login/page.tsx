"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell, Field, SubmitButton } from "@/components/AuthUI";

function LoginInner() {
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
            ? "這個帳號還沒完成 email 驗證，請先收信點驗證連結。"
            : json?.error?.message || "登入失敗"
        );
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("連線失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="登入 The Blue Wing"
      foot={<>還沒有帳號？<Link href="/register" className="text-[#7ff0cd] hover:underline">註冊</Link></>}
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email" type="email" value={email} onChange={setEmail} autoFocus />
        <Field label="密碼" type="password" value={password} onChange={setPassword} />
        <div className="text-right">
          <Link href="/forgot-password" className="text-[12px] text-[#8a8a8a] hover:text-white">忘記密碼？</Link>
        </div>
        {error && <p className="text-[12.5px] leading-relaxed text-[#ff9b9b]">{error}</p>}
        <SubmitButton busy={busy} disabled={!email || !password}>登入</SubmitButton>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthShell title="登入 The Blue Wing">{null}</AuthShell>}>
      <LoginInner />
    </Suspense>
  );
}
