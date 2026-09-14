import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo/site";

/** Generation workspace behind the login wall — never indexed. */
export const metadata: Metadata = { title: "生成工作室", ...NOINDEX };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
