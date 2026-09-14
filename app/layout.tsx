import type { Metadata } from "next";
import "./globals.css";
import AppFrame from "@/components/AppFrame";


import JobToasts from "@/components/JobToasts";
import { GenerationJobsProvider } from "@/lib/jobsStore";
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL, organizationLd, webSiteLd } from "@/lib/seo/site";

/**
 * Site-wide defaults. Every public page overrides `title` / `description`
 * (and gets the `%s · The Blue Wing` template); pages behind the login wall
 * spread NOINDEX from lib/seo/site.ts. metadataBase makes relative OG /
 * canonical URLs resolve to the canonical origin, not the request host.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — ${SITE_TAGLINE}`, template: `%s · ${SITE_NAME}` },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: SITE_NAME, locale: "zh_TW", url: SITE_URL, title: `${SITE_NAME} — ${SITE_TAGLINE}`, description: DEFAULT_DESCRIPTION },
  twitter: { card: "summary_large_image", title: `${SITE_NAME} — ${SITE_TAGLINE}`, description: DEFAULT_DESCRIPTION },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="h-dvh overflow-hidden bg-black text-[var(--bw-text)]">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: organizationLd() }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: webSiteLd() }} />
        <GenerationJobsProvider>
          <AppFrame>{children}</AppFrame>
          <JobToasts />
        </GenerationJobsProvider>
      </body>
    </html>
  );
}
