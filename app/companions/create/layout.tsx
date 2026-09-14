import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo/site";

/** Character builder — never indexed. */
export const metadata: Metadata = { title: "建立陪聊角色", ...NOINDEX };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
