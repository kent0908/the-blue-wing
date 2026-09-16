import type { Metadata } from "next";
import { getTr } from "@/lib/i18n/server";
import { NOINDEX } from "@/lib/seo/site";

/** Auth form — never indexed. */
export async function generateMetadata(): Promise<Metadata> {
  const tr = await getTr();
  const title = tr("登入");
  // "登入" translates to a lowercase verb phrase for buttons; a tab title wants a capital
  return { title: title.charAt(0).toUpperCase() + title.slice(1), ...NOINDEX };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
