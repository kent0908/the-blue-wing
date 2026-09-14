import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo/site";

/** Auth form — never indexed. */
export const metadata: Metadata = { title: "Email 驗證", ...NOINDEX };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
