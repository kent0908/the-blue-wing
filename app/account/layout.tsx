import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo/site";

/** Personal account page — never indexed. */
export const metadata: Metadata = { title: "個人資訊", ...NOINDEX };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
