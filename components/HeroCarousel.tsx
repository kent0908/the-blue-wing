"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { IconChevronLeft, IconChevronRight } from "./Icons";

type Slide = {
  title: string;
  subtitle: string;
  href: string;
  gradient: string;
  image?: string;
  overlayLeft?: string;
  overlayRight?: string;
};

interface HeroBlock {
  id: number;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  targetMode: string | null;
  modelId: string | null;
  prompt: string | null;
}

function heroHref(b: HeroBlock): string {
  const p = new URLSearchParams();
  if (b.targetMode) p.set("mode", b.targetMode);
  if (b.modelId) p.set("model", b.modelId);
  if (b.prompt) p.set("q", b.prompt);
  p.set("preset", String(b.id));
  return `/studio?${p.toString()}`;
}

const SLIDES: Slide[] = [
  {
    title: "Seedance 2.0",
    subtitle: "多鏡頭故事敘述，具備電影級運動效果",
    href: "/studio?mode=video",
    gradient: "linear-gradient(135deg,#2b1f1a 0%,#4a2f22 55%,#1a1210 100%)",
  },
  {
    title: "Seedream 5.0 Pro｜圖層分離",
    subtitle: "精準編輯、多語言生成、高密度視覺，一應俱全",
    href: "/studio?mode=image",
    gradient: "linear-gradient(135deg,#3b2f16 0%,#6b5423 50%,#1c1710 100%)",
    overlayLeft: "Unflatten Reality",
    overlayRight: "Reframe the Future.",
  },
  {
    title: "音樂影片助手",
    subtitle: "用幾秒鐘將任何歌曲變成驚豔的音樂影片",
    href: "/studio?mode=video",
    gradient: "linear-gradient(135deg,#3d1418 0%,#7a2224 55%,#170a0c 100%)",
  },
  {
    title: "Veo 3.1",
    subtitle: "原生音軌、電影級畫面，最長 60 秒",
    href: "/studio?mode=video",
    gradient: "linear-gradient(135deg,#131f38 0%,#24406e 55%,#0b1120 100%)",
  },
  {
    title: "Imagen 4",
    subtitle: "文字排版更準確，寫實質感更細膩",
    href: "/studio?mode=image",
    gradient: "linear-gradient(135deg,#152b26 0%,#22483d 55%,#0b1614 100%)",
  },
];

export default function HeroCarousel() {
  const [dynamicSlides, setDynamicSlides] = useState<Slide[] | null>(null);

  useEffect(() => {
    fetch("/api/home-blocks")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const hero: HeroBlock[] = j?.hero ?? [];
        if (hero.length) {
          setDynamicSlides(
            hero.map((b, idx) => ({
              title: b.title,
              subtitle: b.subtitle,
              href: heroHref(b),
              gradient: SLIDES[idx % SLIDES.length].gradient,
              image: b.imageUrl ?? undefined,
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  const slides = dynamicSlides ?? SLIDES;
  const [rawI, setI] = useState(2);
  const [paused, setPaused] = useState(false);
  const n = slides.length;
  const i = ((rawI % n) + n) % n; // stays valid when the slide count changes

  const go = useCallback((d: number) => setI((p) => p + d), []);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((p) => p + 1), 6000);
    return () => clearInterval(t);
  }, [paused]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative flex h-[300px] items-center justify-center gap-4 overflow-hidden">
        {slides.map((s, idx) => {
          let offset = idx - i;
          if (offset > n / 2) offset -= n;
          if (offset < -n / 2) offset += n;
          if (Math.abs(offset) > 1) return null;

          const isCenter = offset === 0;
          return (
            <Link
              key={`${idx}-${s.title}`}
              href={s.href}
              className="absolute overflow-hidden rounded-2xl transition-all duration-500 ease-out"
              style={{
                background: s.gradient,
                width: isCenter ? "min(540px, 46%)" : "min(500px, 42%)",
                height: isCenter ? 300 : 264,
                transform: `translateX(${offset * 78}%) scale(${isCenter ? 1 : 0.94})`,
                opacity: isCenter ? 1 : 0.55,
                zIndex: isCenter ? 10 : 5,
              }}
            >
              {s.image && (
                // eslint-disable-next-line @next/next/no-img-element -- public content proxy
                <img src={s.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
              <div className="relative flex h-full flex-col justify-end p-7">
                {isCenter && s.overlayLeft && (
                  <div className="absolute inset-x-7 top-1/3 flex justify-between text-[15px] text-white/85">
                    <span>{s.overlayLeft}</span>
                    <span>{s.overlayRight}</span>
                  </div>
                )}
                <div className="bg-gradient-to-t from-black/60 to-transparent pt-10">
                  <h3 className={`font-semibold ${isCenter ? "text-[26px]" : "text-[20px]"}`}>{s.title}</h3>
                  <p className="mt-1 text-[13px] text-white/70">{s.subtitle}</p>
                </div>
              </div>
            </Link>
          );
        })}

        <button
          onClick={() => go(-1)}
          aria-label="上一張"
          className="absolute left-[7%] z-20 grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white/80 backdrop-blur transition-colors hover:bg-black/70 hover:text-white"
        >
          <IconChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => go(1)}
          aria-label="下一張"
          className="absolute right-[7%] z-20 grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white/80 backdrop-blur transition-colors hover:bg-black/70 hover:text-white"
        >
          <IconChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex items-center justify-center gap-1.5">
        {slides.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setI(idx)}
            aria-label={`第 ${idx + 1} 張`}
            className={[
              "h-1 rounded-full transition-all",
              idx === i ? "w-7 bg-white" : "w-3.5 bg-[#3a3a3a] hover:bg-[#555]",
            ].join(" ")}
          />
        ))}
      </div>
    </div>
  );
}
