"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const NAV = [
  { href: "/crm", label: "總覽", hint: "KPI · 活躍 · 營收" },
  { href: "/crm/finance", label: "收入與利潤", hint: "每日 · 每模型" },
  { href: "/crm/costs", label: "成本設定", hint: "牌價 · 折扣" },
  { href: "/admin", label: "會員與點數", hint: "帳號 · 方案 · 發點" },
  { href: "/crm/users", label: "會員分析", hint: "使用紀錄 · 帳號詳情" },
  { href: "/admin/rates", label: "扣點費率", hint: "零售點數" },
  { href: "/admin/models", label: "模型管理", hint: "名稱 · 排序" },
  { href: "/admin/home", label: "首頁與模板", hint: "官方內容" },
  { href: "/admin/landing", label: "啟程展示", hint: "展示素材" },
  { href: "/crm/audit", label: "稽核紀錄", hint: "後台操作軌跡" },
  { href: "/crm/settings", label: "系統設定", hint: "點數價值 · 寄信" },
];

/**
 * The back-office CRM shell — deliberately its own layout (AppFrame steps
 * aside for /crm, see components/AppFrame.tsx) so operations data never
 * shares a screen with the product UI. Admin-only: the gate is the API
 * (every /api/crm/* and /api/admin/* route calls requireAdmin); this
 * client check only decides what to render.
 */
export default function CrmLayout({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<{ email: string; role: string; uid?: string | null } | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        const user = j?.user ?? null;
        setMe(user);
        if (!user) router.replace(`/login?next=${encodeURIComponent(path)}`);
      })
      .catch(() => alive && setMe(null));
    return () => {
      alive = false;
    };
  }, [path, router]);

  if (me === undefined) {
    return (
      <div className="grid h-full place-items-center bg-[#0a0a0a]">
        <div className="bw-shimmer h-8 w-8 rounded-full" />
      </div>
    );
  }
  if (!me || me.role !== "admin") {
    return (
      <div className="grid h-full place-items-center bg-[#0a0a0a] px-6">
        <div className="max-w-sm rounded-xl border border-[#4a2020] bg-[#1a1010] px-5 py-4 text-center text-[13.5px] text-[#ffb4b4]">
          這個頁面只有管理員可以進入。
          <div className="mt-3">
            <Link href="/" className="text-[#7ff0cd] underline">回首頁</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row bg-[#0a0a0a] text-[#e6e6e6]">
      <aside className="flex w-full md:w-[220px] shrink-0 flex-col border-b md:border-r border-[#1c1c1c] bg-[#0d0d0d]">
        <div className="border-b border-[#1c1c1c] px-4 py-2 md:py-4">
          <div className="text-[11px] uppercase tracking-widest text-[#6d6d6d]">The Blue Wing</div>
          <div className="mt-0.5 text-[15px] font-semibold text-white">管理後台</div>
        </div>
        <nav className="flex gap-1 overflow-x-auto p-2 md:block md:flex-1 md:space-y-0.5">
          {NAV.map((n) => {
            const active = ["/crm", "/admin"].includes(n.href) ? path === "/crm" : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={`block shrink-0 rounded-lg px-3 py-2 ${active ? "bg-[#1c1c1c] text-white" : "text-[#9a9a9a] hover:bg-[#151515] hover:text-white"}`}>
                <div className="text-[13px]">{n.label}</div>
                <div className="hidden md:block text-[10.5px] text-[#6d6d6d]">{n.hint}</div>
              </Link>
            );
          })}
        </nav>
        <div className="hidden md:block border-t border-[#1c1c1c] p-3 text-[11px] text-[#6d6d6d]">
          <div className="truncate text-[#9a9a9a]" title={me.email}>{me.email}</div>
          {me.uid && <div className="font-mono">UID {me.uid}</div>}
          <div className="mt-2 flex gap-2">
            <Link href="/?account=1" className="hover:text-white">個人資訊</Link>
            <span>·</span>
            <Link href="/" className="hover:text-white">回產品</Link>
          </div>
        </div>
      </aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1720px] px-4 py-4 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}
