"use client";

import CharacterGrid from "@/components/CharacterGrid";

/**
 * 陪聊角色 — its own sidebar destination (was a tab buried inside /assets;
 * moved out so it's a first-class surface, not something you have to know to
 * go dig for). Character creation still pulls its avatar from the asset
 * library (CharacterGrid's own picker), so "把資產庫的圖變角色" still works
 * the same way — this page is just the front door to it.
 */
export default function CompanionsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1000px] px-6 py-8">
        <h1 className="text-[22px] font-semibold tracking-tight">陪聊角色</h1>
        <p className="mt-1 text-[13px] text-[#8a8a8a]">
          把資產庫裡的圖片變成角色，設定人設之後長期陪聊——多聊聊、聊到 ta 喜歡的話題，好感度會慢慢累積。
        </p>
        <div className="mt-6">
          <CharacterGrid />
        </div>
      </div>
    </div>
  );
}
