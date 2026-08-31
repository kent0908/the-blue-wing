"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import HeroCarousel from "@/components/HeroCarousel";
import { IconArrowRight, IconClose, IconModel, IconPlus, IconSparkle } from "@/components/Icons";

interface Block {
  id: number;
  title: string;
  subtitle: string;
  badge: string | null;
  imageUrl: string | null;
  targetMode: string | null;
  modelId: string | null;
  prompt: string | null;
}

const DEFAULT_SHOWCASE: Block[] = [
  { id: -1, title: "Seedance 2.0", subtitle: "電影級影片生成", badge: "熱門", imageUrl: null, targetMode: "video", modelId: null, prompt: null },
  { id: -2, title: "GPT-Image-2", subtitle: "更清晰的圖像創作", badge: null, imageUrl: null, targetMode: "image", modelId: "gpt-image-2", prompt: null },
  { id: -3, title: "Seedream 5.0 Pro", subtitle: "生產級視覺創作", badge: null, imageUrl: null, targetMode: "image", modelId: "Dola-Seedream-5.0-pro", prompt: null },
  { id: -4, title: "Veo 3.1", subtitle: "原生音軌、電影級畫面", badge: "新", imageUrl: null, targetMode: "video", modelId: "veo-3.1-generate-001", prompt: null },
];

const DEFAULT_TEMPLATES: Block[] = [
  { id: -5, title: "關鍵影格攝影機", subtitle: "用關鍵影格控制攝影機移動", badge: null, imageUrl: null, targetMode: "video", modelId: null, prompt: null },
  { id: -6, title: "故事板網格", subtitle: "將創意轉化為多幀場景", badge: null, imageUrl: null, targetMode: "image", modelId: null, prompt: null },
  { id: -7, title: "鏡頭設計師", subtitle: "創造電影級攝影機角度", badge: null, imageUrl: null, targetMode: "video", modelId: null, prompt: null },
  { id: -8, title: "電影色彩", subtitle: "添加豐富的電影風格色調", badge: null, imageUrl: null, targetMode: "image", modelId: null, prompt: null },
];

const TINTS = ["#2e4a2a", "#4a2f2a", "#4a3d24", "#2a3550"];

function hrefFor(b: Block): string {
  const p = new URLSearchParams();
  if (b.targetMode) p.set("mode", b.targetMode);
  if (b.modelId) p.set("model", b.modelId);
  if (b.prompt) p.set("q", b.prompt);
  if (b.id > 0) p.set("preset", String(b.id));
  const qs = p.toString();
  return qs ? `/studio?${qs}` : "/studio?mode=video";
}

export default function HomePage() {
  const router = useRouter();
  const [banner, setBanner] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [showcase, setShowcase] = useState<Block[]>(DEFAULT_SHOWCASE);
  const [templates, setTemplates] = useState<Block[]>(DEFAULT_TEMPLATES);

  useEffect(() => {
    fetch("/api/home-blocks")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        if (Array.isArray(j.showcase) && j.showcase.length) setShowcase(j.showcase);
        if (Array.isArray(j.template) && j.template.length) setTemplates(j.template);
      })
      .catch(() => {});
  }, []);

  const start = () => {
    const q = prompt.trim();
    router.push(`/studio?mode=video${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  };

  return (
    <div className="relative h-full overflow-y-auto">
      {banner && (
        <div className="relative flex items-center justify-center gap-4 bg-gradient-to-r from-[#0d3a2e] via-[#0a2f26] to-[#071d18] px-6 py-2.5 text-[13px]">
          <span className="flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-[11.5px] text-[#7ff0cd]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7ff0cd]" />
            限時優惠
          </span>
          <span className="font-medium">
            最高 <span className="text-[#7ff0cd]">五折優惠</span> 每月方案
          </span>
          <span className="hidden text-[#a8c9c0] sm:inline">免費獲得 Seedance 2.5 的 7 分鐘 480p 影片</span>
          <button className="flex items-center gap-1 rounded-full bg-[#7ff0cd] px-3 py-1 text-[12px] font-medium text-[#062018]">
            領取獎勵 <IconArrowRight className="h-3 w-3" />
          </button>
          <button
            onClick={() => setBanner(false)}
            aria-label="關閉"
            className="absolute right-5 text-white/50 transition-colors hover:text-white"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mx-auto max-w-[1240px] px-6 pb-40 pt-6">
        <HeroCarousel />

        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Link
            href="/studio?mode=video"
            className="relative flex flex-col justify-center overflow-hidden rounded-xl p-5"
            style={{ background: "linear-gradient(115deg,#4fd1c5 0%,#3aa8e0 55%,#1d7fd6 100%)" }}
          >
            <div className="text-[15px] font-semibold text-[#04211d]">Seedance 2.5 新版本 🔥</div>
            <div className="mt-3 flex items-center gap-1 text-[13px] text-[#04211d]/80">
              立即體驗 <IconArrowRight className="h-3.5 w-3.5" />
            </div>
          </Link>

          {showcase.slice(0, 4).map((m) => (
            <Link
              key={m.id}
              href={hrefFor(m)}
              className="group relative flex flex-col overflow-hidden rounded-xl bg-[#141414] text-center transition-colors hover:bg-[#1a1a1a]"
            >
              {m.badge && (
                <span
                  className="bw-badge absolute right-3 top-3 z-10"
                  style={{ color: m.badge === "熱門" ? "var(--bw-hot)" : "var(--bw-mint)" }}
                >
                  {m.badge}
                </span>
              )}
              {m.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- public content proxy
                <img src={m.imageUrl} alt="" className="h-24 w-full object-cover" />
              ) : (
                <div className="grid h-24 w-full place-items-center bg-[#181818]">
                  <IconModel className="h-7 w-7 text-white" />
                </div>
              )}
              <div className="flex flex-1 flex-col justify-center gap-1 p-4">
                <div className="text-[14px] font-medium">{m.title}</div>
                <div className="text-[12px] text-[#7d7d7d]">{m.subtitle}</div>
              </div>
            </Link>
          ))}
        </div>

        <section className="mt-8 rounded-2xl bg-[#0e0e0e] p-6">
          <h2 className="text-[26px] font-semibold tracking-tight">用畫布創造更多</h2>
          <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {templates.slice(0, 8).map((c, i) => (
              <Link key={c.id} href={hrefFor(c)} className="group">
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- public content proxy
                  <img
                    src={c.imageUrl}
                    alt=""
                    className="aspect-[4/3] w-full rounded-xl object-cover transition-transform group-hover:-translate-y-0.5"
                  />
                ) : (
                  <div
                    className="aspect-[4/3] rounded-xl transition-transform group-hover:-translate-y-0.5"
                    style={{ background: `linear-gradient(160deg,${TINTS[i % TINTS.length]} 0%,#101010 100%)` }}
                  />
                )}
                <div className="mt-3 text-[14px] font-medium">{c.title}</div>
                <div className="text-[12.5px] text-[#7d7d7d]">{c.subtitle}</div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="pointer-events-none sticky bottom-6 flex justify-center px-6">
        <div className="pointer-events-auto flex w-full max-w-[600px] items-center gap-3 rounded-full border border-[#2a2a2a] bg-[#161616]/95 py-2 pl-3 pr-2 backdrop-blur">
          <button className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#242424] text-[#9a9a9a] transition-colors hover:text-white">
            <IconPlus className="h-4 w-4" />
          </button>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && start()}
            placeholder="描述你想生成的內容畫面"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-white placeholder:text-[#6d6d6d] focus:outline-none"
          />
          <button
            onClick={start}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-4 text-[13.5px] font-medium text-[#0a1a16] transition-[filter] hover:brightness-105"
          >
            <IconSparkle className="h-4 w-4" />
            開始創作
          </button>
        </div>
      </div>
    </div>
  );
}
