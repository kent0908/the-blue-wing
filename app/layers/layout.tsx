import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo/site";

/** Layer sets — never indexed. */
export const metadata: Metadata = { title: "圖層", ...NOINDEX };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
