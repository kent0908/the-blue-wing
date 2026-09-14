import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo/site";

/** Digital human workspace — never indexed. */
export const metadata: Metadata = { title: "數位人", ...NOINDEX };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
