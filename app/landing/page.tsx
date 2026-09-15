import Link from "next/link";
import type { Metadata } from "next";
import { getDict } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "啟程：用一句話生成 AI 影片與圖片",
  description: "The Blue Wing 的入口頁：認識影片生成、圖片生成、智慧畫布、3D 導演台、圖層編輯與 AI 陪聊角色，免費每日 10 點立即開始。",
  alternates: { canonical: "/landing" },
};
import WingExperience from "@/components/WingExperience";
import LandingMedia from "@/components/LandingMedia";
import ClosingGlow from "@/components/ClosingGlow";
import { landingGallerySlots } from "@/lib/landingSlots";
import Image from "next/image";
import { IconArrowRight, IconImage, IconVideo, IconCanvas, IconChat } from "@/components/Icons";
import { getLandingMediaMap } from "@/lib/landingMedia";
import styles from "./landing.module.css";

// This page has no dynamic APIs (no cookies/headers/searchParams read), so
// Next.js's default would prerender it once at BUILD TIME and serve that
// static HTML forever — meaning an admin's uploaded hero/feature media
// (lib/landingMedia.ts) would never actually appear on the live site until
// the next deploy, regardless of how promptly /api/landing-media itself
// reflects the change. Real finding (2026-09-06): confirmed the upload →
// DB-write path works, then found THIS is why the public page still didn't
// show it. ISR re-runs the component (including the DB read below) at most
// once per minute, so an upload shows up shortly after without paying for a
// full server-render on every single visitor.
// Rendered per request: the copy follows the visitor's language cookie (lib/i18n), so it can't be prerendered once.
export const dynamic = "force-dynamic";

const FEATURES = [
  { id: "video", label: "01 / AI VIDEO", href: "/studio?mode=video", icon: IconVideo },
  { id: "image", label: "02 / AI IMAGE", href: "/studio?mode=image", icon: IconImage },
  { id: "canvas", label: "03 / CREATIVE WORKFLOW", href: "/canvas", icon: IconCanvas },
  { id: "companions", label: "04 / AI COMPANION", href: "/companions", icon: IconChat },
] as const;

export default async function LandingPage(){
  const [media, { t }] = await Promise.all([getLandingMediaMap(), getDict()]);
  const L = t.landing;
  const features = FEATURES.map((f) => ({ ...f, ...L.features[f.id] }));
  return <div className={styles.page}>
  <header className={styles.header}>
    <Link href="/" className={styles.brand}><Image src="/wing-mark.png" width={38} height={38} alt=""/>The Blue Wing</Link>
    <nav aria-label={t.nav.mainNav} className={styles.nav}><a href="#video">{L.navVideo}</a><a href="#image">{L.navImage}</a><a href="#canvas">{L.navCanvas}</a><a href="#companions">{L.navCompanions}</a></nav>
    <Link href="/studio?mode=video" className={styles.smallCta}>{L.start} <IconArrowRight className="h-4 w-4"/></Link>
  </header>
  <WingExperience/>
  {media.hero && <section className={styles.hero}>
    {media.hero ? (
      media.hero.kind === "video"
        ? <video className={styles.heroMedia} src={media.hero.url} autoPlay muted loop playsInline disablePictureInPicture disableRemotePlayback aria-hidden="true"/>
        // eslint-disable-next-line @next/next/no-img-element
        : <img className={styles.heroMedia} src={media.hero.url} alt="" aria-hidden="true"/>
    ) : (
      <div className={styles.orbit} aria-hidden="true"><div/><div/><div/></div>
    )}
    {media.hero && <div className={styles.heroOverlay} aria-hidden="true"/>}
    <div className={styles.heroContent}>
      <p className={styles.eyebrow}>THE BLUE WING · CREATIVE STUDIO</p>
      <h1>{L.h1a}<br/><span>{L.h1b}</span></h1>
      <p className={styles.subtitle}>{L.subtitle1}<br/>{L.subtitle2}</p>
      <div className={styles.actions}><Link className={styles.primary} href="/studio?mode=video">{L.start} <IconArrowRight className="h-5 w-5"/></Link><a className={styles.secondary} href="#video">{L.explore} <span>↓</span></a></div>
    </div>
    <div className={styles.heroFooter}><span>IMAGE / VIDEO / CANVAS / COMPANION</span><span>SCROLL TO EXPLORE ↓</span></div>
  </section>}
  <div className={styles.features}>{features.map((f,i)=><section key={f.id} id={f.id} className={styles.feature}>
    <div className={styles.copy}><p className={styles.eyebrow}>{f.label}</p><h2>{f.title}</h2><p>{f.text}</p><Link href={f.href} className={styles.secondary}>{f.action}<IconArrowRight className="h-4 w-4"/></Link></div>
    <div className={styles.gallery} aria-label={`${f.title} ${L.gallery}`}>
      {landingGallerySlots(f.id).map((slot,index)=>{
       const m=media[slot];
       return <div key={slot} data-media-slot={slot} className={`${styles.galleryCard} ${index===0?styles.featuredCard:styles.sideCard} ${styles['art'+i]}`}>
        {m?<LandingMedia media={m} label={`${f.title} ${index===0?L.mainShow:`${L.work} ${index+1}`}`}/>:<div className={styles.placeholder}>
         <f.icon className={styles.placeholderIcon}/><span>{index===0?L.placeholderMain:L.placeholderMore}</span><small>{index===0?'CREATE YOUR NEXT STORY':'TO BE CONTINUED'}</small>
        </div>}
        <div className={styles.cardCaption}><span>{String(index+1).padStart(2,'0')}</span><span>{index===0?L.featured:m?L.extended:L.soon}</span></div>
</div>;
      })}
    </div>
  </section>)}</div>
  <section className={styles.closing}><ClosingGlow/><p className={styles.eyebrow}>PEOPLE + AI, TOGETHER</p><h2>{L.closingA}<br/>{L.closingB}</h2><Link href="/studio?mode=image" className={styles.primary}>{L.closingCta} <IconArrowRight className="h-5 w-5"/></Link></section>
  <footer className={styles.footer}><span>The Blue Wing</span><div><Link href="/">{L.footHome}</Link><Link href="/help">{L.footHelp}</Link><Link href="/login">{L.footLogin}</Link></div></footer>
  {/* One fixed bottom-left shortcut into the app. Page-level on purpose — a
      2026-09-08 merge had pulled this inside the gallery-card .map(), which
      rendered 12 identical position:fixed links stacked on the same spot. */}
  <Link href="/" className={styles.floatHome}>{L.floatHome}</Link>
</div>;
}

