import type { Metadata } from "next";
import Link from "next/link";
import { MODEL_PAGES, modelPageName, modelPricing, modelSpecs } from "@/lib/seo/models";
import { listRates, type ModelRate } from "@/lib/rateCard";
import { SITE_DEFINITION, breadcrumbLd, jsonLd, absoluteUrl } from "@/lib/seo/site";
import ModelLogo from "@/components/ModelLogo";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "AI 影片與圖片模型一覽：Seedance、Veo、GPT image、Seedream、Gemini",
  description: "The Blue Wing 提供的每一個 AI 影片與圖片生成模型：支援模式、解析度或尺寸、參考素材上限、每次生成的點數，與適合的用途。Seedance 2.5、Veo 3.1、GPT image 2.5 sunburst、Seedream 5.0 pro、Gemini 3 pro image。",
  alternates: { canonical: "/models" },
  openGraph: { title: "AI 影片與圖片模型一覽 · The Blue Wing", description: "每個模型的能力、限制與點數，一頁看完。", url: "/models" },
};

export default async function ModelsIndex() {
  let rates: ModelRate[] = [];
  try { rates = await listRates(); } catch { /* rates table unreachable — show pages without prices */ }
  const groups = [
    { kind: "video" as const, title: "影片模型", sub: "文生影、圖生影、首尾幀、參考素材與運鏡" },
    { kind: "image" as const, title: "圖片模型", sub: "文生圖、圖生圖、透明背景、圖層分離" },
  ];
  const listLd = jsonLd({ "@type": "ItemList", itemListElement: MODEL_PAGES.map((m, i) => ({ "@type": "ListItem", position: i + 1, name: modelPageName(m), url: absoluteUrl(`/models/${m.slug}`) })) });
  return (
    <div className="h-full overflow-y-auto">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: listLd }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbLd([{ name: "首頁", path: "/" }, { name: "模型", path: "/models" }]) }} />
      <div className="mx-auto max-w-[1080px] px-6 py-10">
        <h1 className="text-[28px] font-semibold tracking-tight text-white">AI 影片與圖片模型一覽</h1>
        <p className="mt-3 max-w-[64ch] text-[14.5px] leading-7 text-[#b8b8b8]">{SITE_DEFINITION}</p>
        <p className="mt-2 max-w-[64ch] text-[13.5px] leading-6 text-[#8a8a8a]">下面每一頁的規格都是站內實際接受的參數，點數依目前費率表計算。免費方案每天 10 點，先用最便宜的模型試方向，再用高階模型出成品。</p>
        {groups.map((g) => {
          const items = MODEL_PAGES.filter((m) => m.kind === g.kind);
          return (
            <section key={g.kind} className="mt-10">
              <h2 className="text-[19px] font-semibold text-white">{g.title}</h2>
              <p className="text-[13px] text-[#8a8a8a]">{g.sub}</p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {items.map((m) => {
                  const s = modelSpecs(m); const p = modelPricing(m, rates);
                  const facts = m.kind === "video" ? [s.resolutions.join("/"), `最長 ${s.maxSeconds} 秒`, s.maxRefs ? `${s.maxRefs} 個參考` : "無參考"] : [`${s.sizes.length} 種尺寸`, s.refImages ? "參考圖" : "純文字", s.transparentBg ? "透明背景" : s.negativePrompt ? "負向提示詞" : ""].filter(Boolean);
                  return (
                    <li key={m.slug}>
                      <Link href={`/models/${m.slug}`} className="flex h-full gap-3 rounded-2xl border border-[#1e1e1e] bg-[#111] p-4 transition-colors hover:border-[#3a3a3a]">
                        <ModelLogo id={m.id} size={36} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2"><h3 className="text-[15px] font-medium text-white">{modelPageName(m)}</h3>{p && <span className="shrink-0 text-[12px] text-[#7ff0cd]">{p.perUnit} 點/{p.unit}</span>}</div>
                          <p className="mt-1 text-[13px] leading-5 text-[#b8b8b8]">{m.tagline}</p>
                          <p className="mt-2 text-[11.5px] text-[#7a7a7a]">{facts.join(" · ")}</p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
