import type { Metadata } from "next";
import SeedanceDraftLibrary from "@/components/SeedanceDraftLibrary";
import { getLocale } from "@/lib/i18n/server";
import { draftLibraryCopy } from "@/lib/i18n/draftLibrary";
import { NOINDEX } from "@/lib/seo/site";

export async function generateMetadata(): Promise<Metadata> {
  const copy = draftLibraryCopy(await getLocale());
  return { title: copy.library, description: copy.metaDescription, ...NOINDEX };
}

export default function DraftsPage() { return <SeedanceDraftLibrary />; }
