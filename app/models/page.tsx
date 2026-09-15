import type { Metadata } from "next";
import Link from "next/link";
import { MODEL_PAGES, modelPageName, modelPricing, modelSpecs } from "@/lib/seo/models";
import { listRates, type ModelRate } from "@/lib/rateCard";
import { breadcrumbLd, jsonLd, absoluteUrl } from "@/lib/seo/site";
import ModelLogo from "@/components/ModelLogo";
import { getTr } from "@/lib/i18n/server";
// Rendered per request: the copy follows the visitor's language cookie (lib/i18n), so it can't be prerendered once.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
 title: "模型一覽｜為想像，選一種筆觸",
 description: "從動態影像到靜態創作，探索 The Blue Wing 的模型、創作用途與生成規格。",
 alternates: { canonical: "/models" },
 openGraph: { title: "為想像，選一種筆觸 · The Blue Wing", description: "鏡頭、光影、色彩。從你想創作的畫面開始。", url: "/models" },
};
export default async function ModelsIndex() {
 const tr = await getTr();
 let rates: ModelRate[] = [];
 try { rates = await listRates(); } catch { /* Keep the collection readable without rates. */ }
 const groups = [
  { kind: "video" as const, number: "01", title: tr("讓故事流動"), label: tr("動態影像"), sub: tr("一個回眸，一陣風。讓鏡頭接著說故事。") },
  { kind: "image" as const, number: "02", title: tr("讓想像停留"), label: tr("靜態創作"), sub: tr("構圖、色彩與留白，描繪你心中的畫面。") },
 ];
 const listLd = jsonLd({ "@type": "ItemList", itemListElement: MODEL_PAGES.map((m,i)=>({"@type":"ListItem",position:i+1,name:modelPageName(m),url:absoluteUrl(`/models/${m.slug}`)})) });
 return <div className="h-full overflow-y-auto bg-[#0b0c0c] text-[#eeeae1]">
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:listLd}} />
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:breadcrumbLd([{name:tr("首頁"),path:"/"},{name:tr("模型一覽"),path:"/models"}])}} />
  <main className="mx-auto max-w-[1360px] px-6 pb-20 pt-12 sm:px-10 lg:px-16 lg:pt-20">
   <header className="border-b border-[#343630] pb-10 sm:pb-14">
    <div className="flex items-center justify-between gap-4 text-[11px] tracking-[0.2em] text-[#a4a599]"><span>{tr("THE BLUE WING / 創作工具選集")}</span><span className="hidden sm:block">{tr("模型一覽")}</span></div>
    <div className="mt-10 grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-end">
     <h1 className="font-serif text-[clamp(2.5rem,5vw,4.8rem)] font-normal leading-[1.3] tracking-[0.02em]">{tr("為想像，")}<br /><span className="text-[#b6c7bc]">{tr("選一種筆觸。")}</span></h1>
     <div className="max-w-[360px] lg:justify-self-end"><p className="text-[15px] leading-8 text-[#b7b8ae]">{tr("有些故事，需要一個鏡頭。")}<br />{tr("有些心情，留在一張畫裡就好。")}</p><p className="mt-4 text-[13px] leading-7 text-[#8d9189]">{tr("從心中的畫面出發，")}<span className="bw-phrase">{tr("找到合適的創作工具。")}</span></p></div>
    </div>
    <nav aria-label={tr("創作類別")} className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm"><a className="border-b border-[#a9bdad] pb-2 transition-colors hover:text-white" href="#video">{tr("01　動態影像 ↗")}</a><a className="border-b border-[#44483f] pb-2 transition-colors hover:text-white" href="#image">{tr("02　靜態創作 ↗")}</a></nav>
   </header>
   {groups.map(g=><section id={g.kind} key={g.kind} className="scroll-mt-8 pt-12 sm:pt-16">
    <div className="mb-8 grid gap-4 md:grid-cols-[1fr_1fr]"><div><p className="mb-3 text-[11px] tracking-[0.2em] text-[#a6b7a9]">{g.number} / {tr(g.label)}</p><h2 className="font-serif text-3xl font-normal sm:text-4xl">{tr(g.title)}</h2></div><p className="max-w-sm text-sm leading-7 text-[#999e94] md:self-end md:justify-self-end">{g.sub}</p></div>
    <ul className="grid gap-x-10 lg:grid-cols-2">
     {MODEL_PAGES.filter(m=>m.kind===g.kind).map(m=>{const s=modelSpecs(m),p=modelPricing(m,rates);const facts=m.kind==='video'?[s.resolutions.join(' / '),tr('最長 {n} 秒', { n: s.maxSeconds ?? 0 })]:[tr('{n} 種尺寸', { n: s.sizes.length }),s.refImages?tr("可使用參考圖"):tr("文字創作")];return <li key={m.slug} className="border-t border-[#2d312b]">
      <Link href={`/models/${m.slug}`} className="group block h-full py-7 outline-offset-4 transition-colors hover:bg-[#ffffff03] focus-visible:outline focus-visible:outline-[#b6c7bc] sm:py-8">
       <div className="flex items-center gap-3"><ModelLogo id={m.id} size={30}/><h3 className="min-w-0 flex-1 break-words text-[17px] font-medium tracking-wide">{modelPageName(m)}</h3><span aria-hidden="true" className="text-[#8b9d8e] transition-transform group-hover:translate-x-1">↗</span></div>
       <p className="mt-5 max-w-[38ch] text-[14px] leading-7 text-[#c0c2b7]">{tr(m.tagline)}</p>
       <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[#21251f] pt-4 text-[11px] leading-5 text-[#8d968a]"><span>{facts.join(' · ')}</span>{p&&<span className="whitespace-nowrap">{p.perUnit} {tr("點／")}{p.unit} {tr("起")}</span>}</div>
      </Link></li>})}
    </ul>
   </section>)}
   <footer className="mt-12 flex flex-wrap items-center justify-between gap-5 border-t border-[#343630] pt-7 text-xs leading-6 text-[#92998d]"><p>{tr("規格與可選功能見各模型內頁。實際點數依生成設定計算。")}</p><Link className="text-[#c2d2c5]" href="/studio">{tr("帶著想法，開始創作 ↗")}</Link></footer>
  </main>
 </div>;
}
