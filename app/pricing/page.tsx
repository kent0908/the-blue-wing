import Link from "next/link";
import { PLANS } from "@/lib/plans";
import { CREDIT_PACKS } from "@/lib/creditPacks";
import type { Metadata } from "next";
import { jsonLd, SITE_URL } from "@/lib/seo/site";
import { getDict } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "方案與點數價格：免費每日 10 點、Basic / Standard / Premium 與點數包",
  description: `The Blue Wing 的收費方式：免費方案每天 10 點，${PLANS.filter(p=>p.priceUSD>0).map(p=>`${p.name} $${p.priceUSD}/月（${p.monthlyCredits.toLocaleString("en-US")} 點）`).join("、")}；點數包 ${CREDIT_PACKS.map(p=>`${p.credits.toLocaleString("en-US")} 點 $${p.priceUSD}`).join("、")}。影片依秒數與解析度計點，圖片依張數計點。`,
  alternates: { canonical: "/pricing" },
  openGraph: { title: "方案與點數價格 · The Blue Wing", description: "免費每日 10 點起，方案與點數包一覽。", url: "/pricing" },
};

const offersLd = jsonLd({
  "@type": "Product",
  name: "The Blue Wing 創作方案",
  description: "AI 影片與圖片生成的點數方案與點數包",
  brand: { "@id": `${SITE_URL}/#organization` },
  offers: [
    ...PLANS.map((p) => ({ "@type": "Offer", name: `${p.name} 方案`, price: String(p.priceUSD), priceCurrency: "USD", description: p.priceUSD ? `每月 ${p.monthlyCredits.toLocaleString("en-US")} 點` : `每天 ${p.dailyCredits ?? 0} 點`, url: `${SITE_URL}/pricing`, availability: "https://schema.org/InStock" })),
    ...CREDIT_PACKS.map((c) => ({ "@type": "Offer", name: `${c.credits.toLocaleString("en-US")} 點數包`, price: String(c.priceUSD), priceCurrency: "USD", url: `${SITE_URL}/pricing`, availability: "https://schema.org/InStock" })),
  ],
});

export default async function PricingPage(){const { t } = await getDict(); const P = t.pricing; const COPY = P.plans as Record<string, { eyebrow: string; description: string; features: readonly string[] }>;
return <div className="h-full overflow-y-auto bg-[#080909] text-white"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: offersLd }} /><div className="mx-auto max-w-[1560px] px-4 py-12 sm:px-8 lg:py-16">
<header className="mx-auto mb-10 max-w-2xl text-center"><p className="text-xs font-medium tracking-[.3em] text-[#7ff0cd]">{P.eyebrow}</p><h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl"><span className="block">{P.h1a}</span><span className="mt-2 block">{P.h1b}</span></h1><p className="mt-5 text-sm leading-7 text-neutral-400">{P.sub1}<br/>{P.sub2}</p><span className="mt-6 inline-block rounded-full border border-neutral-700 bg-neutral-900 px-5 py-2 text-xs text-neutral-300">{P.monthlyUsd}</span></header>
<div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">{PLANS.map(p=>{const special=p.code==="standard",gold=p.code==="premium",c=COPY[p.code];return <section key={p.code} className={`flex flex-col rounded-[24px] border p-[1px] ${gold?"border-[#dfbf72] bg-gradient-to-br from-[#ffedb2] to-[#e2b854]":special?"border-[#b3c8dc] bg-gradient-to-br from-[#eff6ff] to-[#aabfd5]":"border-[#303333] bg-[#222525]"}`}>
<div className={`flex h-9 items-center justify-center text-xs font-semibold ${special||gold?"text-[#182029]":"text-neutral-400"}`}>{special?P.recommended:gold?P.premiumTag:c.eyebrow}</div>
<div className={`flex flex-1 flex-col rounded-[21px] p-5 lg:p-6 ${gold?"bg-gradient-to-b from-[#292115] to-[#111313]":"bg-[#111313]"}`}>
<h2 className="text-xl font-semibold">{p.name}</h2><p className="mt-2 min-h-10 text-xs leading-5 text-neutral-400">{c.description}</p><div className="mt-5 flex items-baseline gap-2"><span className="text-5xl font-semibold tracking-tight">${p.priceUSD}</span><span className="text-xs text-neutral-400">{p.priceUSD?P.perMonth:P.free}</span></div><p className="mt-3 text-xs text-neutral-500">{p.priceUSD?P.adminActivates:P.dailyNoCarry}</p>
<Link href={p.code==="free"?"/register":"/account"} className={`mt-6 rounded-full px-4 py-3 text-center text-sm font-semibold text-black transition hover:brightness-110 ${gold?"bg-gradient-to-r from-[#fff0c0] to-[#ffd665]":special?"bg-gradient-to-r from-white to-[#b4c8df]":"bg-[#e7e9e9]"}`}>{p.priceUSD?P.howToActivate:P.startFree}</Link>
<div className="my-6 rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="text-xs text-neutral-400">{p.dailyCredits?P.dailyCredits:P.monthlyCredits}</p><p className="mt-2 text-3xl font-semibold">{(p.dailyCredits||p.monthlyCredits).toLocaleString()} <span className="text-xs font-normal text-neutral-400">{P.credits}</span></p><div className="mt-4 flex justify-between border-t border-white/10 pt-3 text-xs"><span className="text-neutral-400">{p.priceUSD?P.unitPrice:P.howToClaim}</span><span>{p.priceUSD?`US$ ${(p.priceUSD/p.monthlyCredits).toFixed(5)}`:P.claimDaily}</span></div></div>
<ul className="space-y-4 pb-4 text-sm text-neutral-300">{c.features.map(f=><li key={f} className="flex gap-3"><span className={gold?"text-[#eacb80]":"text-[#7ff0cd]"}>✓</span>{f}</li>)}</ul><p className="mt-auto pt-5 text-xs leading-5 text-neutral-500">{p.priceUSD?P.deductNote:P.previewNote}</p>
</div></section>})}</div>
<section className="mt-12 rounded-3xl border border-neutral-800 bg-[#101212] p-5 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs tracking-widest text-[#7ff0cd]">{P.extra}</p><h2 className="mt-2 text-2xl font-semibold">{P.extraTitle}</h2></div><p className="text-xs text-neutral-400">{P.extraSub}</p></div><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{CREDIT_PACKS.map(p=><Link href="/account" key={p.code} className="group rounded-2xl border border-neutral-700 bg-white/[.02] p-5 transition hover:border-[#7ff0cd]"><p className="text-xl font-semibold">{p.credits.toLocaleString()} <span className="text-xs text-neutral-400">{P.credits}</span></p><div className="mt-4 flex items-center justify-between"><span className="text-[#7ff0cd]">US$ {p.priceUSD}</span><span className="text-neutral-500 group-hover:text-white">↗</span></div><p className="mt-2 text-xs text-neutral-500">{P.perCredit} {(p.priceUSD/p.credits).toFixed(4)}</p></Link>)}</div></section>
<div className="mx-auto mt-8 max-w-3xl text-center text-xs leading-6 text-neutral-500"><p>{P.foot1}</p><p>{P.foot2}</p></div>
</div></div>}
