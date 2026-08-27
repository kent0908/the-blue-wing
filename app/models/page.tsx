"use client";

import Link from "next/link";
import { useState } from "react";
import { IconArrowRight, IconCheck, IconImage } from "@/components/Icons";
import { IMAGE_MODELS, type ImageModel } from "@/lib/imageModels";

export default function ModelsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1240px] px-6 pb-32 pt-8">
        <header className="mb-6">
          <h1 className="text-[28px] font-semibold tracking-tight">圖片生成模型</h1>
          <p className="mt-1.5 text-[13.5px] text-[#8a8a8a]">
            點任一張卡片即可帶著該模型進入創作頁，參數面板會依模型自動切換成它支援的欄位。
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {IMAGE_MODELS.map((m) => (
            <ModelCard key={m.id} model={m} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ModelCard({ model }: { model: ImageModel }) {
  const [copied, setCopied] = useState(false);

  const copyId = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard?.writeText(model.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };

  return (
    <Link
      href={`/studio?mode=image&model=${encodeURIComponent(model.id)}`}
      className="group flex flex-col rounded-2xl border border-[#262626] bg-[#141414] p-5 transition-colors hover:border-[#3a3a3a] hover:bg-[#171717]"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-[#183a30] px-2 py-1 text-[11px] font-medium text-[#7ff0cd]">
          <IconImage className="h-3.5 w-3.5" />
          IMAGE
        </span>
      </div>

      <h2 className="mt-3 text-[16.5px] font-semibold">{model.name}</h2>

      <div className="mt-1 flex items-center gap-2">
        <code className="truncate text-[12.5px] text-[#8a8a8a]">{model.id}</code>
        <button
          type="button"
          onClick={copyId}
          aria-label="複製模型 ID"
          className="shrink-0 text-[#6d6d6d] transition-colors hover:text-white"
        >
          {copied ? <IconCheck className="h-3.5 w-3.5 text-[#7ff0cd]" /> : <CopyGlyph />}
        </button>
      </div>

      <p className="mt-2 text-[12.5px] leading-relaxed text-[#9a9a9a]">{model.blurb}</p>

      <div className="mt-4 rounded-xl border border-[#242424] bg-[#101010] p-3">
        <div className="text-[11.5px] font-medium text-[#7ff0cd]">Pricing</div>
        <div className="mt-1 flex items-center justify-between text-[13px]">
          <span className="text-[#c9c9c9]">圖片生成</span>
          <span className="font-medium">{model.price}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {model.tags.map((t) => (
          <span
            key={t}
            className="rounded-md border border-[#2c2c2c] px-2 py-1 text-[10.5px] tracking-wide text-[#8a8a8a]"
          >
            {t}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-1 text-[12.5px] text-[#7ff0cd] opacity-0 transition-opacity group-hover:opacity-100">
        用這個模型生成 <IconArrowRight className="h-3.5 w-3.5" />
      </div>
    </Link>
  );
}

function CopyGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-3.5 w-3.5">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" strokeLinecap="round" />
    </svg>
  );
}
