"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthUI";
import { useT } from "@/lib/i18n/client";
import { authDestination } from "@/lib/authDestination";

function VerifyInner() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const next = authDestination(params.get("next"), "/account");
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
          router.push(next);
          router.refresh();
        }, 900);
      } catch {
        setState("error");
        setMessage(t.auth.networkDot);
      }
    })();
  }, [token, router, t, next]);

  return (
    <AuthShell
      title={t.auth.verifyTitle}
      foot={state === "error" ? <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-[#8ab8ed] hover:underline">{t.auth.backLogin}</Link> : null}
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
