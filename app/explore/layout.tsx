import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo/site";

/** Redirect-only route — never indexed. */
export const metadata: Metadata = { title: "探索", ...NOINDEX };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
