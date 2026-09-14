import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/seo/site";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Brand card for links shared to LINE / Threads / X / Discord. */
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #06100d 0%, #0b1a16 55%, #0f2a23 100%)", color: "#e8f5f0", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 30, letterSpacing: 6, color: "#7ff0cd" }}>THE BLUE WING</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.1 }}>AI 影片、圖片與創作平台</div>
          <div style={{ fontSize: 32, color: "#a9c9bf", lineHeight: 1.4 }}>Seedance 2.5 · Veo 3.1 · GPT image 2.5 · Seedream 5.0 — 一句話就能出片</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: "#7ff0cd" }}><span>thebluewing.studio</span><span>文生影 · 圖生影 · 智慧畫布 · 3D 導演台</span></div>
      </div>
    ),
    size,
  );
}
