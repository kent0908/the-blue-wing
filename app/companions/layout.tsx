import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI 陪聊角色：官方角色與自訂角色，會記得你、會換裝、會動",
  description: "The Blue Wing 的 AI 陪聊角色：10 位官方角色可直接領養，也能自己建立角色設定、外觀與個性。好感度系統、場景解鎖、服裝更換、待機動態影片，全年齡官方角色有嚴格內容規範。",
  alternates: { canonical: "/companions" },
  openGraph: { title: "AI 陪聊角色 · The Blue Wing", description: "官方角色與自訂角色，會記得你、會換裝、會動。", url: "/companions" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
