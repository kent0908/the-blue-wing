import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";
import { MODEL_PAGES } from "@/lib/seo/models";
import { FAQ_CATEGORIES } from "@/lib/supportFaq";

/** Only pages a visitor can read without signing in. Model and help pages are generated from the same catalogues that render them. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const fixed: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/landing`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/models`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/help`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/companions`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
  ];
  const models: MetadataRoute.Sitemap = MODEL_PAGES.map((m) => ({ url: `${SITE_URL}/models/${m.slug}`, lastModified: m.updatedAt, changeFrequency: "monthly", priority: 0.8 }));
  const help: MetadataRoute.Sitemap = FAQ_CATEGORIES.map((c) => ({ url: `${SITE_URL}/help/${c.id}`, lastModified: now, changeFrequency: "monthly", priority: 0.6 }));
  return [...fixed, ...models, ...help];
}
