import type { Metadata } from "next";
import { getTr } from "@/lib/i18n/server";
import { NOINDEX } from "@/lib/seo/site";

/** Digital human workspace — never indexed. */
export async function generateMetadata(): Promise<Metadata> {
  const tr = await getTr();
  return { title: tr("數位人"), ...NOINDEX };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
