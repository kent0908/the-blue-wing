"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell, Field, SubmitButton } from "@/components/AuthUI";

function ResetInner() {
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
      setError("兩次輸入的新密碼不一致");
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
        setError(json?.error?.message || "重設失敗");
        return;
      }
      setOk(true);
      setTimeout(() => {
        router.push("/account");
        router.refresh();
      }, 900);
    } catch {
      setError("連線失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="重設密碼" foot={<Link href="/forgot-password" className="text-[#7ff0cd] hover:underline">重新申請</Link>}>
        <p className="text-[13px] leading-relaxed text-[#ff9b9b]">缺少重設碼，請從信裡的連結進來。</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="重設密碼"
      foot={!ok ? <Link href="/login" className="text-[#7ff0cd] hover:underline">回登入</Link> : null}
    >
      {ok ? (
        <p className="text-[13px] leading-relaxed text-[#7ff0cd]">密碼已重設，已為你登入，正在前往帳號頁…</p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <Field label="新密碼" type="password" value={pw} onChange={setPw} autoFocus hint="至少 8 個字元" />
          <Field label="再次輸入新密碼" type="password" value={confirm} onChange={setConfirm} />
          {error && <p className="text-[12.5px] leading-relaxed text-[#ff9b9b]">{error}</p>}
          <SubmitButton busy={busy} disabled={!pw || !confirm}>設定新密碼</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthShell title="重設密碼">{null}</AuthShell>}>
      <ResetInner />
    </Suspense>
  );
}
