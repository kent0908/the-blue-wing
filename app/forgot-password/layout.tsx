import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo/site";

/** Auth form — never indexed. */
export const metadata: Metadata = { title: "忘記密碼", ...NOINDEX };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
