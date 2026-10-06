"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight } from "./Icons";
import { useTr } from "@/lib/i18n/client";
import styles from "./HomeEditorial.module.css";
import { k } from "@/lib/i18n/tr";

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

const FILMS = ["battle", "worlds", "art", "sound"];
const SLIDES: Slide[] = [
 { title: k("破夜"), subtitle: k("迎面而來的危機，交給動作與節奏回答。"), href: "/studio?mode=video&model=SIRAYA-Seedance-2.5", gradient: "#16222d" },
 { title: k("一翼，萬象"), subtitle: k("一片藍羽，穿過不同的世界，將故事帶向同一片海。"), href: "/studio?mode=video&model=SIRAYA-Seedance-2.5", gradient: "#192a28" },
 { title: k("美，不只有一種答案"), subtitle: k("從動畫到版畫，再走進畫廊。同一個瞬間，有不同的看法。"), href: "/studio?mode=image", gradient: "#272a1e" },
 { title: k("世界有聲，想像有形"), subtitle: k("循著雨、列車與海風，讓封閉的空間慢慢打開。"), href: "/studio?mode=video", gradient: "#242623" },
];

export default function HeroCarousel() {
  const tr = useTr();
  const [dynamicSlides, setDynamicSlides] = useState<Slide[] | null>(null);

  useEffect(() => {
    fetch("/api/home-blocks")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const hero: HeroBlock[] = Array.isArray(j?.hero) ? j.hero.filter((b: HeroBlock)=>b.title?.trim()) : [];
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
  const [rawI, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(true);
  const region = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(()=>{
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = ()=>{setReduced(mq.matches); if(mq.matches) setPlaying(false)};
    update(); mq.addEventListener("change",update);
    const observer = new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:0.15});
    if(region.current) observer.observe(region.current);
    return ()=>{observer.disconnect();mq.removeEventListener("change",update)};
  },[]);
  const [failed, setFailed] = useState(false);
  const i = rawI % slides.length;
  const current = slides[i];
  const film = FILMS[i % FILMS.length];
  const poster = `/home-films/${film}.jpg`;
  useEffect(()=>{
    const player = video.current;
    if(!player) return;
    if(playing && visible) void player.play().catch(()=>setPlaying(false));
    else player.pause();
  },[playing, visible, i, failed, current.image]);
  const select = (index: number)=>{setI(index);setFailed(false);setPlaying(!reduced)};
  return <section ref={region} className={styles.hero} aria-label={tr("創作展示")}>
    <div className={styles.masthead}><span>THE BLUE WING / CREATIVE STUDIO</span><span>SELECTED POSSIBILITIES — 01</span></div>
    <div className={styles.intro}><h1>{tr("讓想像，留下畫面。")}</h1><p>{tr("從一束光、一個角色，到一段值得留下的故事。")}</p></div>
    <div className={styles.stage}>
      <div className={styles.visual}>
        {!current.image && !failed ? <video ref={video} key={film} src={`/home-films/${film}.mp4`} poster={poster} preload="metadata" muted playsInline onError={()=>{setPlaying(false);setFailed(true)}} onEnded={()=>select((i+1)%slides.length)} aria-label={tr(current.title)+tr("預覽")} /> :
          // eslint-disable-next-line @next/next/no-img-element -- existing public artwork
          <img key={current.image || poster} src={current.image || poster} alt={tr(current.title)} fetchPriority="high" />}
        <div className={styles.caption}><span>BLUE WING / ORIGINAL FILMS</span><span>{tr("靜音預覽")}</span></div>
        {!current.image && <button className={styles.play} onClick={()=>{if(failed){setFailed(false);setPlaying(true)}else setPlaying(p=>!p)}} aria-label={tr(playing ? "暫停創作片段" : "播放創作片段")}>{playing ? "Ⅱ" : "▶"} <span>{tr(failed ? "重新載入片段" : playing ? "暫停片段" : "播放片段")}</span></button>}
        {failed && <p role="status" className={styles.mediaError}>{tr("片段暫時無法載入，請稍後重試。")}</p>}
      </div>
      <div className={styles.essay}>
        <span className={styles.index}>{String(i+1).padStart(2,"0")} <small>/ {String(slides.length).padStart(2,"0")}</small></span>
        <div aria-live="polite"><p className={styles.eyebrow}>SELECTED FILM</p><h2>{tr(current.title)}</h2><p className={styles.description}>{tr(current.subtitle)}</p></div>
        <Link className={styles.cta} href={current.href}>{tr("開始探索")} <span>↗</span></Link>
        <div className={styles.navigation}><button onClick={()=>{select((i+slides.length-1)%slides.length)}} aria-label={tr("上一張")}><IconChevronLeft /></button><div className={styles.dots}>{slides.map((s,j)=><button key={j} aria-label={tr("第 {n} 張",{n:j+1})} aria-pressed={i===j} onClick={()=>{select(j)}}><span /></button>)}</div><button onClick={()=>{select((i+1)%slides.length)}} aria-label={tr("下一張")}><IconChevronRight /></button></div>
      </div>
    </div>
  </section>;
}
