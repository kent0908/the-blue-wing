import type { Metadata } from "next";
import { getTr } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getTr();
  return {
    // the template keeps "· The Blue Wing" on /companions/create and /companions/[id], whose own titles would otherwise replace this one outright
    title: { default: tr("AI 陪聊角色：官方角色與自訂角色，會記得你、會換裝、會動"), template: "%s · The Blue Wing" },
    description: tr("The Blue Wing 的 AI 陪聊角色：10 位官方角色可直接領養，也能自己建立角色設定、外觀與個性。好感度系統、場景解鎖、服裝更換、待機動態影片，全年齡官方角色有嚴格內容規範。"),
    alternates: { canonical: "/companions" },
    openGraph: { title: `${tr("AI 陪聊角色")} · The Blue Wing`, description: tr("官方角色與自訂角色，會記得你、會換裝、會動。"), url: "/companions" },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
