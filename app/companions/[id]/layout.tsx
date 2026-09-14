import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo/site";

/** Private chat with a character — never indexed. */
export const metadata: Metadata = { title: "陪聊", ...NOINDEX };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
