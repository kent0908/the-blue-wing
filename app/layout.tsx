import type { Metadata } from "next";
import "./globals.css";
import AppFrame from "@/components/AppFrame";


import JobToasts from "@/components/JobToasts";
import { GenerationJobsProvider } from "@/lib/jobsStore";
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL, organizationLd, webSiteLd } from "@/lib/seo/site";
import { getLocale } from "@/lib/i18n/server";
import { LOCALE_TAG, type Locale } from "@/lib/i18n/locale";
import { trFor } from "@/lib/i18n/tr";
import { LocaleProvider } from "@/lib/i18n/client";

/**
 * Site-wide defaults, in the visitor's language. Every public page overrides `title` / `description`
 * (and gets the `%s · The Blue Wing` template); pages behind the login wall
 * spread NOINDEX from lib/seo/site.ts. metadataBase makes relative OG /
 * canonical URLs resolve to the canonical origin, not the request host.
 */
const OG_LOCALE: Record<Locale, string> = { "zh-Hant": "zh_TW", en: "en_US", ja: "ja_JP" };
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const tr = trFor(locale);
  const tagline = tr(SITE_TAGLINE), description = tr(DEFAULT_DESCRIPTION);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${SITE_NAME} — ${tagline}`, template: `%s · ${SITE_NAME}` },
    description,
    applicationName: SITE_NAME,
    alternates: { canonical: "/" },
    openGraph: { type: "website", siteName: SITE_NAME, locale: OG_LOCALE[locale], url: SITE_URL, title: `${SITE_NAME} — ${tagline}`, description },
    twitter: { card: "summary_large_image", title: `${SITE_NAME} — ${tagline}`, description },
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={LOCALE_TAG[locale]}>
      <body className="h-dvh overflow-hidden bg-black text-[var(--bw-text)]">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: organizationLd() }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: webSiteLd() }} />
        <LocaleProvider locale={locale}>
          <GenerationJobsProvider>
            <AppFrame>{children}</AppFrame>
            <JobToasts />
          </GenerationJobsProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
