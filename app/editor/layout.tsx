import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo/site";

/** Layer editor — never indexed. */
export const metadata: Metadata = { title: "圖層編輯", ...NOINDEX };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
