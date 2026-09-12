"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AccountDialog from "./AccountDialog";
import { IconHelp, IconSparkle } from "./Icons";

interface Me {
  user: { email: string; role: string; nickname: string | null } | null;
  credits?: number;
  plan?: { code: string; name: string };
}

export default function TopBar() {
  const router = useRouter();
  const search=useSearchParams();
  const requestedAccount=search.get("account")==="1";
  const [accountOpen,setAccountOpen]=useState(false);
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
    window.addEventListener("profile-updated",onFocus);
    return () => { window.removeEventListener("focus", onFocus);window.removeEventListener("profile-updated",onFocus); };
  }, []);

  useEffect(()=>{if(requestedAccount)queueMicrotask(()=>setAccountOpen(true));},[requestedAccount]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await refresh();
    router.push("/");
    router.refresh();
  };

  return (
    <><header className="flex h-14 shrink-0 items-center justify-end gap-1 whitespace-nowrap bg-black pr-2 sm:pr-6 [&>a]:shrink-0 [&>button]:shrink-0">
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
          <button
            onClick={()=>setAccountOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-[#3a3a3a] px-3 py-1.5 text-[13px] text-white transition-colors hover:border-[#555]"
            title="點數"
          >
            <IconSparkle className="h-3.5 w-3.5 text-[#7ff0cd]" />
            {(me.credits ?? 0).toLocaleString()}
          </button>
          {me.user.role === "admin" && (
            <>
              <Link href="/crm" className="rounded-lg px-2 py-1.5 text-[13px] text-[#d4d4d4] hover:text-white">管理後台</Link>
            </>
          )}
          <button
            onClick={()=>setAccountOpen(true)}
            className="max-w-[80px] sm:max-w-[160px] truncate rounded-lg px-2 py-1.5 text-[13px] text-[#d4d4d4] transition-colors hover:text-white"
            aria-label="開啟個人資訊"
            title={me.user.nickname||"個人資訊"}
          >
            {me.user.nickname||"個人資訊"}
          </button>
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
    </header><AccountDialog open={accountOpen && !!me?.user} onClose={()=>setAccountOpen(false)}/></>
  );
}

