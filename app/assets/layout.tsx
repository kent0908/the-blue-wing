import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo/site";

/** Private asset library — never indexed. */
export const metadata: Metadata = { title: "資產庫", ...NOINDEX };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
