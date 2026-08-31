"use client";

import Link from "next/link";
import AdminTabs from "../AdminTabs";

export default function AdminHomeContentPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-[22px] font-semibold tracking-tight">首頁 / 模板</h1>
          <Link href="/account" className="text-[12.5px] text-[#8a8a8a] hover:text-white">回帳號</Link>
        </div>
        <AdminTabs active="home" />
        <p className="text-[13px] text-[#8a8a8a]">首頁卡片與模板的編輯介面即將上線。</p>
      </div>
    </div>
  );
}
