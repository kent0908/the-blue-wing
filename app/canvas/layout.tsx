import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo/site";

/** Canvas editor and boards — never indexed. */
export const metadata: Metadata = { title: "智慧畫布", ...NOINDEX };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
