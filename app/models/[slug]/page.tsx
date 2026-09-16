import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MODEL_PAGES, modelPageBySlug, modelPageName, modelPricing, modelSpecs, type ModelPage } from "@/lib/seo/models";
import { listRates, type ModelRate } from "@/lib/rateCard";
import { SITE_DEFINITION, SITE_NAME, SITE_URL, absoluteUrl, breadcrumbLd, faqLd, jsonLd } from "@/lib/seo/site";
import ModelLogo from "@/components/ModelLogo";
import { getDict, getTr } from "@/lib/i18n/server";
import { fmt, type Dict } from "@/lib/i18n/dict";
import type { Tr } from "@/lib/i18n/tr";

// Rendered per request: the copy follows the visitor's language cookie (lib/i18n), so it can't be prerendered once.
export const dynamic = "force-dynamic";
export const dynamicParams = false;

export function generateStaticParams() {
  return MODEL_PAGES.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = modelPageBySlug(slug);
  if (!page) return {};
  const name = modelPageName(page);
  const tr = await getTr();
  const kind = page.kind === "video" ? tr("AI 影片生成") : tr("AI 圖片生成");
  const title = tr("{name} {kind}：能力、限制與點數", { name, kind });
  const description = tr("{name}（{vendor}）在 The Blue Wing 上的完整說明：{tagline} 支援模式、解析度或尺寸、參考素材上限、每次生成的點數，以及適合與不適合的用途。", { name, vendor: page.vendor, tagline: tr(page.tagline) });
  return { title, description, alternates: { canonical: `/models/${page.slug}` }, openGraph: { title: `${name} · ${SITE_NAME}`, description, url: `/models/${page.slug}`, type: "article" }, twitter: { card: "summary_large_image", title: `${name} · ${SITE_NAME}`, description } };
}

async function safeRates(): Promise<ModelRate[]> {
  try {
    return await listRates();
  } catch {
    return [];
  }
}

function faqFor(t: Dict, tr: Tr, page: ModelPage, name: string, specs: ReturnType<typeof modelSpecs>, pricing: ReturnType<typeof modelPricing>) {
  const M = t.models;
  const faq: { question: string; answer: string }[] = [];
  if (page.kind === "video") {
    faq.push({ question: fmt(M.faqMaxSec.q, { name }), answer: fmt(M.faqMaxSec.a, { name, n: specs.maxSeconds ?? 0 }) });
    faq.push({ question: fmt(M.faqRes.q, { name }), answer: fmt(M.faqRes.a, { list: specs.resolutions.join(M.listSep) }) });
    faq.push({ question: fmt(M.faqRefV.q, { name }), answer: specs.maxRefs > 0 ? fmt(M.faqRefV.yes, { n: specs.maxRefs, video: specs.videoRef ? M.faqRefV.video : "" }) : fmt(/i2v/i.test(page.id) ? M.faqRefV.noImage : M.faqRefV.noText, { name }) });
  } else {
    faq.push({ question: fmt(M.faqSizes.q, { name }), answer: fmt(M.faqSizes.a, { list: specs.sizes.join(M.listSep) }) });
    faq.push({ question: fmt(M.faqRefI.q, { name }), answer: specs.refImages ? M.faqRefI.yes : M.faqRefI.no });
    faq.push({ question: fmt(M.faqBg.q, { name }), answer: specs.transparentBg ? M.faqBg.yes : M.faqBg.no });
  }
  if (pricing) {
    const unit = pricing.unit === "秒" ? M.sec : M.img;
    faq.push({ question: fmt(M.faqCost.q, { name }), answer: fmt(M.faqCost.a, { unit, per: pricing.perUnit, examples: pricing.examples.map((e) => `${tr(e.label, e.vars)} ${e.credits}${M.creditUnit}`).join(M.exampleSep) }) });
  }
  faq.push({ question: fmt(M.faqHow.q, { name }), answer: fmt(M.faqHow.a, { name, section: page.kind === "video" ? t.nav.video : t.nav.image, refs: specs.refImages ? M.faqHow.refs : "" }) });
  return faq;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex flex-col gap-1 sm:flex-row sm:gap-4 border-b border-[#1e1e1e] py-2.5 text-[13.5px]"><dt className="sm:w-[128px] shrink-0 text-[#8a8a8a]">{k}</dt><dd className="m-0 min-w-0 flex-1 text-[#e6e6e6]">{v}</dd></div>;
}

export default async function ModelPageView({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = modelPageBySlug(slug);
  if (!page) notFound();
  const { t } = await getDict();
  const tr = await getTr();
  const M = t.models;
  const name = modelPageName(page);
  const specs = modelSpecs(page);
  const pricing = modelPricing(page, await safeRates());
  const faq = faqFor(t, tr, page, name, specs, pricing);
  const unitWord = pricing ? (pricing.unit === "秒" ? M.sec : M.img) : "";
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbLd([{ name: t.nav.home, path: "/" }, { name: M.crumbModels, path: "/models" }, { name, path: `/models/${page.slug}` }]) }} />
      <article className="mx-auto max-w-[880px] px-6 py-10">
        <nav aria-label="breadcrumb" className="text-[12px] text-[#7a7a7a]"><Link href="/models" className="hover:text-white">{M.crumbModels}</Link> <span className="mx-1">/</span> {page.kind === "video" ? M.crumbVideo : M.crumbImage}</nav>
        <header className="mt-3 flex items-start gap-4">
          <ModelLogo id={page.id} size={48} />
          <div className="min-w-0">
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-white">{name}</h1>
            <p className="mt-1 text-[13px] text-[#8a8a8a]">{page.vendor} · {page.kind === "video" ? M.videoModel : M.imageModel} · {M.updated} {page.updatedAt}</p>
          </div>
        </header>
        <p className="mt-5 text-[16px] leading-7 text-[#dcdcdc]">{tr(page.tagline)}</p>
        <p className="mt-3 text-[14.5px] leading-7 text-[#b8b8b8]">{tr(page.blurb)}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={studioHref} className="rounded-full bg-[#7ff0cd] px-5 py-2.5 text-[13.5px] font-semibold text-[#0a1a16] hover:brightness-110">{fmt(M.startWith, { name })}</Link>
          <Link href="/pricing" className="rounded-full border border-[#2a2a2a] px-5 py-2.5 text-[13.5px] text-[#dcdcdc] hover:border-[#444]">{M.seePricing}</Link>
        </div>

        <section className="mt-10">
          <h2 className="text-[18px] font-semibold text-white">{M.specs}</h2>
          <dl className="mt-3">
            <Row k={M.modesLabel} v={specs.modes.map((m) => tr(m)).join(M.listSep)} />
            {page.kind === "video" ? (
              <>
                <Row k={M.resolution} v={specs.resolutions.join(" / ")} />
                <Row k={M.duration} v={`4 – ${specs.maxSeconds} ${M.sec}`} />
                <Row k={M.refMaterials} v={specs.maxRefs > 0 ? `${fmt(M.upTo, { n: specs.maxRefs })}${specs.videoRef ? M.withVideoRef : ""}` : M.unsupported} />
              </>
            ) : (
              <>
                <Row k={M.outputSize} v={specs.sizes.join(" / ")} />
                <Row k={M.refImages} v={specs.refImages ? M.refImagesV : M.unsupported} />
                <Row k={M.transparentBg} v={specs.transparentBg ? M.supported : M.unsupported} />
                <Row k={M.negativePrompt} v={specs.negativePrompt ? M.supported : M.unsupported} />
                <Row k={M.quality} v={specs.quality ? M.qualityV : M.fixed} />
              </>
            )}
            <Row k={M.credits} v={pricing ? `${M.per}${unitWord} ${pricing.perUnit}${M.creditUnit} — ${pricing.examples.map((e) => `${tr(e.label, e.vars)} ${e.credits}${M.creditUnit}`).join(M.exampleSep)}` : M.byRateCard} />
          </dl>
        </section>

        <section className="mt-10 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="text-[18px] font-semibold text-white">{M.bestFor}</h2>
            <ul className="mt-3 space-y-2 text-[14px] leading-6 text-[#cfcfcf]">{page.bestFor.map((t) => <li key={t} className="flex gap-2"><span className="text-[#7ff0cd]">✓</span><span>{tr(t)}</span></li>)}</ul>
          </div>
          <div>
            <h2 className="text-[18px] font-semibold text-white">{M.notFor}</h2>
            <ul className="mt-3 space-y-2 text-[14px] leading-6 text-[#cfcfcf]">{page.notFor.map((t) => <li key={t} className="flex gap-2"><span className="text-[#8a8a8a]">–</span><span>{tr(t)}</span></li>)}</ul>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-[18px] font-semibold text-white">{M.faq}</h2>
          <div className="mt-3 divide-y divide-[#1e1e1e]">
            {faq.map((f) => (
              <details key={tr(f.question)} className="group py-3">
                <summary className="cursor-pointer list-none text-[14.5px] font-medium text-[#e6e6e6] marker:content-none">{tr(f.question)}</summary>
                <p className="mt-2 text-[13.5px] leading-6 text-[#b8b8b8]">{tr(f.answer)}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-[18px] font-semibold text-white">{page.kind === "video" ? M.otherVideo : M.otherImage}</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {siblings.map((m) => (
              <li key={m.slug}><Link href={`/models/${m.slug}`} className="flex items-center gap-3 rounded-xl border border-[#1e1e1e] px-3 py-2.5 hover:border-[#3a3a3a]"><ModelLogo id={m.id} size={26} /><span className="min-w-0"><span className="block text-[13.5px] text-white">{modelPageName(m)}</span><span className="block truncate text-[12px] text-[#8a8a8a]">{tr(m.tagline)}</span></span></Link></li>
            ))}
          </ul>
        </section>

        <footer className="mt-12 border-t border-[#1e1e1e] pt-6 text-[12.5px] leading-6 text-[#7a7a7a]">
          <p>{tr(SITE_DEFINITION)}</p>
          <p className="mt-2">{M.footNote}</p>
        </footer>
      </article>
    </div>
  );
}
