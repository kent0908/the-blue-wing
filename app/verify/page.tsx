"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthUI";
import { useT } from "@/lib/i18n/client";

function VerifyInner() {
  const t = useT();
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"working" | "ok" | "error">(token ? "working" : "error");
  const [message, setMessage] = useState(token ? t.auth.verifying : t.auth.missingVerify);
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
          setMessage(json?.error?.message || t.auth.verifyFailed);
          return;
        }
        setState("ok");
        setMessage(t.auth.verified);
        setTimeout(() => {
          router.push("/account");
          router.refresh();
        }, 900);
      } catch {
        setState("error");
        setMessage(t.auth.networkDot);
      }
    })();
  }, [token, router, t]);

  return (
    <AuthShell
      title={t.auth.verifyTitle}
      foot={state === "error" ? <Link href="/login" className="text-[#7ff0cd] hover:underline">{t.auth.backLogin}</Link> : null}
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
    <Suspense fallback={<AuthShell title="">{null}</AuthShell>}>
      <VerifyInner />
    </Suspense>
  );
}
