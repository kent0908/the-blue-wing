import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FAQ_CATEGORIES } from "@/lib/supportFaq";
import { SITE_DEFINITION, breadcrumbLd, faqLd } from "@/lib/seo/site";
import { getDict, getTr } from "@/lib/i18n/server";

// Rendered per request: the copy follows the visitor's language cookie (lib/i18n), so it can't be prerendered once.
export const dynamic = "force-dynamic";
export const dynamicParams = false;
export function generateStaticParams() {
  return FAQ_CATEGORIES.map((c) => ({ category: c.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const c = FAQ_CATEGORIES.find((x) => x.id === category);
  if (!c) return {};
  const title = `${c.label}常見問題`;
  const description = `${c.label}相關的 ${c.entries.length} 個常見問題：${c.entries.slice(0, 3).map((e) => e.question).join("、")}。The Blue Wing 說明中心。`;
  return { title, description, alternates: { canonical: `/help/${c.id}` }, openGraph: { title: `${title} · The Blue Wing`, description, url: `/help/${c.id}`, type: "article" } };
}

/** One page per FAQ category: the same entries the support chat answers from, now readable by search engines and AI assistants. */
export default async function HelpCategory({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const c = FAQ_CATEGORIES.find((x) => x.id === category);
  if (!c) notFound();
  const { t } = await getDict();
  const tr = await getTr();
  const H = t.help;
  return (
    <div className="h-full overflow-y-auto">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqLd(c.entries) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbLd([{ name: t.nav.home, path: "/" }, { name: H.crumb, path: "/help" }, { name: c.label, path: `/help/${c.id}` }]) }} />
      <article className="mx-auto max-w-[820px] px-6 py-10">
        <nav aria-label="breadcrumb" className="text-[12px] text-[#7a7a7a]"><Link href="/help" className="hover:text-white">{H.crumb}</Link> <span className="mx-1">/</span> {t.models.faq}</nav>
        <h1 className="mt-3 text-[26px] font-semibold tracking-tight text-white">{tr(c.label)}{H.faqSuffix}</h1>
        <p className="mt-2 text-[13.5px] text-[#8a8a8a]">{c.entries.length}{H.countSuffix}</p>
        <div className="mt-6 space-y-6">
          {c.entries.map((e, i) => (
            <section key={e.question} id={`q${i + 1}`} className="scroll-mt-20 rounded-2xl border border-[#1e1e1e] bg-[#111] p-5">
              <h2 className="text-[15.5px] font-medium text-white">{tr(e.question)}</h2>
              <p className="mt-2 whitespace-pre-line text-[14px] leading-7 text-[#c9c9c9]">{tr(e.answer)}</p>
            </section>
          ))}
        </div>
        <nav className="mt-10 border-t border-[#1e1e1e] pt-5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-[#6d6d6d]">{H.otherTopics}</div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {FAQ_CATEGORIES.filter((x) => x.id !== c.id).map((x) => <li key={x.id}><Link href={`/help/${x.id}`} className="rounded-full border border-[#2a2a2a] px-3 py-1 text-[12.5px] text-[#dcdcdc] hover:border-[#444]">{tr(x.label)}</Link></li>)}
          </ul>
        </nav>
        <footer className="mt-8 text-[12.5px] leading-6 text-[#7a7a7a]">{tr(SITE_DEFINITION)}</footer>
      </article>
    </div>
  );
}
