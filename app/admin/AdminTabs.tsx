"use client";

import Link from "next/link";

const TABS = [
  { href: "/admin", key: "users", label: "帳號" },
  { href: "/admin/rates", key: "rates", label: "費率" },
  { href: "/admin/home", key: "home", label: "首頁 / 模板" },
] as const;

export default function AdminTabs({ active }: { active: "users" | "rates" | "home" }) {
  return (
    <div className="mb-5 flex items-center gap-1.5 border-b border-[#1e1e1e] pb-2">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${
            active === t.key ? "bg-[#1c1c1c] text-white" : "text-[#8a8a8a] hover:text-white"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
