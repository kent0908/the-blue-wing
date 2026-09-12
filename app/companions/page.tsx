"use client";

import { useState } from "react";
import CharacterGrid from "@/components/CharacterGrid";
import OfficialCharacterGrid from "@/components/OfficialCharacterGrid";

type Tab = "official" | "mine";

/**
 * 陪聊角色 — one page, two shelves: 官方角色 (the platform's own 3-A班 cast,
 * see lib/companionOfficialSeed.ts) and 我的創作 (characters the user built
 * from their own 資產庫 images). Sharing a personal creation with other
 * users, and the revenue share behind it, are planned but not built — the
 * 我的創作 shelf says so rather than pretending.
 */
export default function CompanionsPage() {
  // lazy initializer reads the remembered shelf; guarded because the first
  // render happens on the server where localStorage doesn't exist
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("bw:companions:tab") : null;
      return saved === "mine" ? "mine" : "official";
    } catch {
      return "official";
    }
  });
  const pick = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem("bw:companions:tab", t);
    } catch {
      // ignore
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-6 py-8">
        <h1 className="text-[22px] font-semibold tracking-tight">陪聊角色</h1>
        <p className="mt-1 text-[13px] text-[#8a8a8a]">跟官方角色一起冒險，或把資產庫裡的圖片變成自己的角色——多聊聊、聊到 ta 喜歡的話題，關係會慢慢累積。</p>

        <div className="mt-5 flex gap-1 border-b border-[#1e1e1e]">
          {(["official", "mine"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => pick(t)}
              className={`-mb-px rounded-t-lg px-4 py-2 text-[13px] ${tab === t ? "border-b-2 border-[#7ff0cd] text-white" : "text-[#8a8a8a] hover:text-white"}`}
            >
              {t === "official" ? "官方角色" : "我的創作"}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === "official" ? (
            <OfficialCharacterGrid />
          ) : (
            <>
              <CharacterGrid />
              <div className="mt-8 rounded-xl border border-dashed border-[#2a2a2a] bg-[#0f0f0f] px-4 py-3 text-[12px] leading-relaxed text-[#6d6d6d]">
                之後會開放把自己的角色分享給其他人，以及分享後的分潤機制——目前個人創作只有自己看得到。
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
