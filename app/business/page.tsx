import type { Metadata } from "next";
import BusinessWorkspace from "@/components/business/BusinessWorkspace";
import { businessCopy } from "@/lib/i18n/business";
import { getLocale } from "@/lib/i18n/server";
import { NOINDEX } from "@/lib/seo/site";
import { Suspense } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const t = businessCopy(await getLocale());
  return { title: t.workspace, description: t.description, alternates: { canonical: "/business" }, ...NOINDEX };
}
export default async function BusinessPage() {
  const t = businessCopy(await getLocale());
  return <Suspense fallback={<p className="p-8 text-sm text-[#bad1c5]" role="status">{t.loading}</p>}><BusinessWorkspace /></Suspense>;
}
