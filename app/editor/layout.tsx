import type { Metadata } from "next";
import { getTr } from "@/lib/i18n/server";
import { NOINDEX } from "@/lib/seo/site";

/** Layer editor — never indexed. */
export async function generateMetadata(): Promise<Metadata> {
  const tr = await getTr();
  return { title: tr("圖層編輯"), ...NOINDEX };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
