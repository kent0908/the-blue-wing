import type { Metadata } from "next";
import SeedanceDraftShowcase from "@/components/SeedanceDraftShowcase";
import { getLocale } from "@/lib/i18n/server";
import { DRAFT_COPY } from "@/lib/i18n/draft";
import { DRAFT_SHOWCASE_MEDIA } from "@/lib/draftShowcase";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const copy = DRAFT_COPY[await getLocale()];
  return {
    title: copy.metaTitle,
    description: copy.metaDescription,
    alternates: { canonical: "/seedance-draft" },
    openGraph: {
      title: copy.metaTitle,
      description: copy.metaDescription,
      url: "/seedance-draft",
      ...(DRAFT_SHOWCASE_MEDIA.heroPoster ? { images: [DRAFT_SHOWCASE_MEDIA.heroPoster] } : {}),
    },
  };
}

export default function SeedanceDraftPage() {
  return <SeedanceDraftShowcase />;
}
