import type { Metadata } from "next";
import BusinessAdmin from "@/components/business/BusinessAdmin";
import { businessCopy } from "@/lib/i18n/business";
import { getLocale } from "@/lib/i18n/server";
import { NOINDEX } from "@/lib/seo/site";

export async function generateMetadata(): Promise<Metadata> {
  return { title: businessCopy(await getLocale()).adminNav, ...NOINDEX };
}
export default function BusinessAdminPage() { return <BusinessAdmin />; }
