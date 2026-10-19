import type { Metadata } from "next";
import BusinessWorkspace from "@/components/business/BusinessWorkspace";
import { businessCopy } from "@/lib/i18n/business";
import { getLocale } from "@/lib/i18n/server";
import { NOINDEX } from "@/lib/seo/site";

export async function generateMetadata(): Promise<Metadata> {
  const t = businessCopy(await getLocale());
  return { title: t.workspace, description: t.description, alternates: { canonical: "/business" }, ...NOINDEX };
}
export default function BusinessPage() { return <BusinessWorkspace />; }
