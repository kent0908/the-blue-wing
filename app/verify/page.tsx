"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthUI";

function VerifyInner() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"working" | "ok" | "error">(token ? "working" : "error");
  const [message, setMessage] = useState(token ? "驗證中…" : "缺少驗證碼，請從註冊信裡的連結進來。");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !token) return;
    ran.current = true;

    (async () => {
      try {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setState("error");
          setMessage(json?.error?.message || "驗證失敗");
          return;
        }
        setState("ok");
        setMessage("驗證完成，已為你登入。");
        setTimeout(() => {
          router.push("/account");
          router.refresh();
        }, 900);
      } catch {
        setState("error");
        setMessage("連線失敗，請稍後再試。");
      }
    })();
  }, [token, router]);

  return (
    <AuthShell
      title="Email 驗證"
      foot={state === "error" ? <Link href="/login" className="text-[#7ff0cd] hover:underline">回登入</Link> : null}
    >
      <p
        className={[
          "text-[13px] leading-relaxed",
          state === "error" ? "text-[#ff9b9b]" : state === "ok" ? "text-[#7ff0cd]" : "text-[#c9c9c9]",
        ].join(" ")}
      >
        {message}
      </p>
    </AuthShell>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<AuthShell title="Email 驗證">{null}</AuthShell>}>
      <VerifyInner />
    </Suspense>
  );
}
