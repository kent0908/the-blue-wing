import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MODEL_PAGES, modelPageBySlug, modelPageName, modelPricing, modelSpecs, type ModelPage } from "@/lib/seo/models";
import { listRates, type ModelRate } from "@/lib/rateCard";
import { SITE_DEFINITION, SITE_NAME, SITE_URL, absoluteUrl, breadcrumbLd, faqLd, jsonLd } from "@/lib/seo/site";
import ModelLogo from "@/components/ModelLogo";

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return MODEL_PAGES.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = modelPageBySlug(slug);
  if (!page) return {};
  const name = modelPageName(page);
  const kind = page.kind === "video" ? "AI 影片生成" : "AI 圖片生成";
  const title = `${name} ${kind}：能力、限制與點數`;
  const description = `${name}（${page.vendor}）在 The Blue Wing 上的完整說明：${page.tagline} 支援模式、解析度或尺寸、參考素材上限、每次生成的點數，以及適合與不適合的用途。`;
  return { title, description, alternates: { canonical: `/models/${page.slug}` }, openGraph: { title: `${name} · ${SITE_NAME}`, description, url: `/models/${page.slug}`, type: "article" }, twitter: { card: "summary_large_image", title: `${name} · ${SITE_NAME}`, description } };
}

async function safeRates(): Promise<ModelRate[]> {
  try {
    return await listRates();
  } catch {
    return [];
  }
}

function faqFor(page: ModelPage, name: string, specs: ReturnType<typeof modelSpecs>, pricing: ReturnType<typeof modelPricing>) {
  const faq: { question: string; answer: string }[] = [];
  if (page.kind === "video") {
    faq.push({ question: `${name} 最長可以生成幾秒的影片？`, answer: `${name} 單次最長 ${specs.maxSeconds} 秒，最短 4 秒；時長以整數秒指定，點數依秒數與解析度計算。` });
    faq.push({ question: `${name} 支援哪些解析度？`, answer: `${specs.resolutions.join("、")}。解析度越高每秒點數越多（720p 為 480p 的 2.25 倍、1080p 為 5.5 倍、4K 為 11 倍）。` });
    faq.push({ question: `${name} 可以附參考圖嗎？`, answer: specs.maxRefs > 0 ? `可以，最多 ${specs.maxRefs} 個參考素材${specs.videoRef ? "，並且接受影片當作運鏡參考（3D 導演台的錄製可直接送入）" : ""}。參考圖最小邊會自動放大到 320 像素、最大邊縮到 2048 像素，所以小圖或超大圖都能用。` : `不行，${name} 走純${/i2v/i.test(page.id) ? "圖片" : "文字"}生影片流程，不接受額外的參考素材；需要主體參考請改用 Seedance 2.0 或 2.5。` });
  } else {
    faq.push({ question: `${name} 可以輸出哪些尺寸？`, answer: `${specs.sizes.join("、")}。` });
    faq.push({ question: `${name} 支援參考圖（圖生圖）嗎？`, answer: specs.refImages ? `支援，最多 4 張參考圖。參考圖會自動調整到 320–2048 像素範圍，不需要自己先縮圖。` : "不支援，這個模型只接受文字提示詞。" });
    faq.push({ question: `${name} 可以輸出透明背景嗎？`, answer: specs.transparentBg ? "可以，把「背景」設為透明，輸出 PNG／WebP 即可去背。" : "不行，此模型沒有背景選項；需要透明背景請用 GPT image 系列，或先生成再用圖層編輯的 AI 去背。" });
  }
  if (pricing) faq.push({ question: `${name} 一次生成要多少點數？`, answer: `每${pricing.unit} ${pricing.perUnit} 點。例如：${pricing.examples.map((e) => `${e.label} ${e.credits} 點`).join("、")}。送出前介面會先顯示這次的預估點數，失敗會自動退還。` });
  faq.push({ question: `${name} 在 The Blue Wing 上怎麼用？`, answer: `登入後到「${page.kind === "video" ? "影片生成" : "圖片生成"}」，在模型選單選 ${name}，輸入描述${specs.refImages ? "、視需要加入參考素材" : ""}後送出。免費方案每天有 10 點可以試用。` });
  return faq;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex flex-col gap-1 sm:flex-row sm:gap-4 border-b border-[#1e1e1e] py-2.5 text-[13.5px]"><dt className="sm:w-[128px] shrink-0 text-[#8a8a8a]">{k}</dt><dd className="m-0 min-w-0 flex-1 text-[#e6e6e6]">{v}</dd></div>;
}

export default async function ModelPageView({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = modelPageBySlug(slug);
  if (!page) notFound();
  const name = modelPageName(page);
  const specs = modelSpecs(page);
  const pricing = modelPricing(page, await safeRates());
  const faq = faqFor(page, name, specs, pricing);
  const siblings = MODEL_PAGES.filter((m) => m.kind === page.kind && m.slug !== page.slug);
  const studioHref = `/studio?mode=${page.kind}&model=${encodeURIComponent(page.id)}`;
  const appLd = jsonLd({
    "@type": "SoftwareApplication",
    name: `${name} on ${SITE_NAME}`,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    url: absoluteUrl(`/models/${page.slug}`),
    description: page.tagline,
    provider: { "@id": `${SITE_URL}/#organization` },
    ...(pricing ? { offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: `每${pricing.unit} ${pricing.perUnit} 點；免費方案每日 10 點` } } : {}),
    dateModified: page.updatedAt,
  });

  return (
    <div className="h-full overflow-y-auto">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: appLd }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqLd(faq) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbLd([{ name: "首頁", path: "/" }, { name: "模型", path: "/models" }, { name, path: `/models/${page.slug}` }]) }} />
      <article className="mx-auto max-w-[880px] px-6 py-10">
        <nav aria-label="路徑" className="text-[12px] text-[#7a7a7a]"><Link href="/models" className="hover:text-white">模型</Link> <span className="mx-1">/</span> {page.kind === "video" ? "影片" : "圖片"}</nav>
        <header className="mt-3 flex items-start gap-4">
          <ModelLogo id={page.id} size={48} />
          <div className="min-w-0">
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-white">{name}</h1>
            <p className="mt-1 text-[13px] text-[#8a8a8a]">{page.vendor} · {page.kind === "video" ? "AI 影片生成模型" : "AI 圖片生成模型"} · 更新於 {page.updatedAt}</p>
          </div>
        </header>
        <p className="mt-5 text-[16px] leading-7 text-[#dcdcdc]">{page.tagline}</p>
        <p className="mt-3 text-[14.5px] leading-7 text-[#b8b8b8]">{page.blurb}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={studioHref} className="rounded-full bg-[#7ff0cd] px-5 py-2.5 text-[13.5px] font-semibold text-[#0a1a16] hover:brightness-110">用 {name} 開始生成 →</Link>
          <Link href="/pricing" className="rounded-full border border-[#2a2a2a] px-5 py-2.5 text-[13.5px] text-[#dcdcdc] hover:border-[#444]">看點數方案</Link>
        </div>

        <section className="mt-10">
          <h2 className="text-[18px] font-semibold text-white">規格</h2>
          <dl className="mt-3">
            <Row k="支援模式" v={specs.modes.join("、")} />
            {page.kind === "video" ? (
              <>
                <Row k="輸出解析度" v={specs.resolutions.join(" / ")} />
                <Row k="時長" v={`4 – ${specs.maxSeconds} 秒`} />
                <Row k="參考素材" v={specs.maxRefs > 0 ? `最多 ${specs.maxRefs} 個${specs.videoRef ? "（含影片參考運鏡）" : ""}` : "不支援"} />
              </>
            ) : (
              <>
                <Row k="輸出尺寸" v={specs.sizes.join(" / ")} />
                <Row k="參考圖" v={specs.refImages ? "最多 4 張（圖生圖／編修）" : "不支援"} />
                <Row k="透明背景" v={specs.transparentBg ? "支援" : "不支援"} />
                <Row k="負向提示詞" v={specs.negativePrompt ? "支援" : "不支援"} />
                <Row k="品質檔位" v={specs.quality ? "低 / 中 / 高" : "固定"} />
              </>
            )}
            <Row k="點數" v={pricing ? `每${pricing.unit} ${pricing.perUnit} 點 — ${pricing.examples.map((e) => `${e.label} ${e.credits} 點`).join("、")}` : "依站內費率表"} />
          </dl>
        </section>

        <section className="mt-10 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="text-[18px] font-semibold text-white">適合</h2>
            <ul className="mt-3 space-y-2 text-[14px] leading-6 text-[#cfcfcf]">{page.bestFor.map((t) => <li key={t} className="flex gap-2"><span className="text-[#7ff0cd]">✓</span><span>{t}</span></li>)}</ul>
          </div>
          <div>
            <h2 className="text-[18px] font-semibold text-white">不適合</h2>
            <ul className="mt-3 space-y-2 text-[14px] leading-6 text-[#cfcfcf]">{page.notFor.map((t) => <li key={t} className="flex gap-2"><span className="text-[#8a8a8a]">–</span><span>{t}</span></li>)}</ul>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-[18px] font-semibold text-white">常見問題</h2>
          <div className="mt-3 divide-y divide-[#1e1e1e]">
            {faq.map((f) => (
              <details key={f.question} className="group py-3">
                <summary className="cursor-pointer list-none text-[14.5px] font-medium text-[#e6e6e6] marker:content-none">{f.question}</summary>
                <p className="mt-2 text-[13.5px] leading-6 text-[#b8b8b8]">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-[18px] font-semibold text-white">其他{page.kind === "video" ? "影片" : "圖片"}模型</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {siblings.map((m) => (
              <li key={m.slug}><Link href={`/models/${m.slug}`} className="flex items-center gap-3 rounded-xl border border-[#1e1e1e] px-3 py-2.5 hover:border-[#3a3a3a]"><ModelLogo id={m.id} size={26} /><span className="min-w-0"><span className="block text-[13.5px] text-white">{modelPageName(m)}</span><span className="block truncate text-[12px] text-[#8a8a8a]">{m.tagline}</span></span></Link></li>
            ))}
          </ul>
        </section>

        <footer className="mt-12 border-t border-[#1e1e1e] pt-6 text-[12.5px] leading-6 text-[#7a7a7a]">
          <p>{SITE_DEFINITION}</p>
          <p className="mt-2">本頁規格由站內實際接受的參數自動產生，與生成介面完全一致；點數依目前費率表計算，送出前會再顯示一次。</p>
        </footer>
      </article>
    </div>
  );
}
