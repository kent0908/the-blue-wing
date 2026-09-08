"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconHelp, IconSparkle } from "./Icons";

interface Me {
  user: { email: string; role: string } | null;
  credits?: number;
  plan?: { code: string; name: string };
}

export default function TopBar() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  const refresh = () =>
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe({ user: null }));

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await refresh();
    router.push("/");
    router.refresh();
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-1 whitespace-nowrap bg-black pr-2 sm:pr-6 [&>a]:shrink-0 [&>button]:shrink-0">
      <Link
        href="/help"
        aria-label="說明"
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13.5px] text-[#d4d4d4] transition-colors hover:text-white"
      >
        <IconHelp className="h-[17px] w-[17px]" />
        <span className="hidden sm:inline">說明</span>
      </Link>

      {me?.user ? (
        <>
          <Link
            href="/account"
            className="flex items-center gap-1.5 rounded-full border border-[#3a3a3a] px-3 py-1.5 text-[13px] text-white transition-colors hover:border-[#555]"
            title="點數"
          >
            <IconSparkle className="h-3.5 w-3.5 text-[#7ff0cd]" />
            {(me.credits ?? 0).toLocaleString()}
          </Link>
          {me.user.role === "admin" && (
            <Link href="/admin" className="rounded-lg px-2 py-1.5 text-[13px] sm:px-3 text-[#d4d4d4] transition-colors hover:text-white">
              後台
            </Link>
          )}
          <Link
            href="/account"
            className="max-w-[80px] sm:max-w-[160px] truncate rounded-lg px-2 py-1.5 text-[13px] text-[#d4d4d4] transition-colors hover:text-white"
            title={me.user.email}
          >
            <span className="sm:hidden">帳號</span><span className="hidden sm:inline">{me.user.email}</span>
          </Link>
          <button
            onClick={logout}
            className="rounded-lg px-2 py-1.5 text-[13px] text-[#8a8a8a] transition-colors hover:text-white"
          >
            登出
          </button>
        </>
      ) : (
        <>
          <Link
            href="/pricing"
            className="flex items-center gap-2 rounded-full border border-[#3a3a3a] px-3.5 py-1.5 text-[13px] text-white transition-colors hover:border-[#555]"
          >
            定價

          </Link>
          <Link
            href="/login"
            className="ml-2 rounded-full bg-gradient-to-r from-[#22d3ee] to-[#3b82f6] px-3 sm:px-6 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90"
          >
            登入
          </Link>
        </>
      )}
    </header>
  );
}

