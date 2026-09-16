import type { Metadata } from "next";
import { getTr } from "@/lib/i18n/server";
import { NOINDEX } from "@/lib/seo/site";

/** Generation workspace behind the login wall — never indexed. */
export async function generateMetadata(): Promise<Metadata> {
  const tr = await getTr();
  return { title: tr("生成工作室"), ...NOINDEX };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
