import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

export const metadata: Metadata = {
  title: "The Blue Wing — AI 影片、圖片與創作平台",
  description:
    "The Blue Wing 把頂尖的影片、圖片與文字模型收在同一個介面裡，一句話就能出片。由 SIRAYA Model Router 提供模型路由。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="h-dvh overflow-hidden bg-black text-[var(--bw-text)]">
        <div className="flex h-full">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <main className="min-h-0 flex-1">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
