"use client";

import { IconHelp, IconGlobe, IconGift } from "./Icons";

export default function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-1 bg-black pr-6">
      <button className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13.5px] text-[#d4d4d4] transition-colors hover:text-white">
        <IconHelp className="h-[17px] w-[17px]" />
        說明
      </button>

      <span className="mx-1 h-4 w-px bg-[#2a2a2a]" />

      <button aria-label="語言" className="rounded-lg p-2 text-[#d4d4d4] transition-colors hover:text-white">
        <IconGlobe className="h-[18px] w-[18px]" />
      </button>

      <span className="mx-1 h-4 w-px bg-[#2a2a2a]" />

      <button aria-label="優惠" className="relative rounded-lg p-2 text-[#d4d4d4] transition-colors hover:text-white">
        <IconGift className="h-[18px] w-[18px]" />
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#ff5a5a]" />
      </button>

      <span className="mx-1 h-4 w-px bg-[#2a2a2a]" />

      <button className="flex items-center gap-2 rounded-full border border-[#3a3a3a] px-3.5 py-1.5 text-[13px] text-white transition-colors hover:border-[#555]">
        定價
        <span className="rounded-full bg-[#ff4d4f] px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">
          74% 折扣
        </span>
      </button>

      <button className="ml-2 rounded-full bg-gradient-to-r from-[#22d3ee] to-[#3b82f6] px-6 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90">
        登入
      </button>
    </header>
  );
}
