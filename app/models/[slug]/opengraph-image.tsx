import { ImageResponse } from "next/og";
import { modelPageBySlug, modelPageName, modelSpecs } from "@/lib/seo/models";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = modelPageBySlug(slug);
  const name = page ? modelPageName(page) : "模型";
  const specs = page ? modelSpecs(page) : null;
  const facts = page && specs ? (page.kind === "video" ? [`${specs.resolutions.join(" / ")}`, `最長 ${specs.maxSeconds} 秒`, specs.maxRefs ? `${specs.maxRefs} 個參考素材` : "文字生影片"] : [`${specs.sizes.length} 種尺寸`, specs.refImages ? "支援參考圖" : "純文字生圖", specs.transparentBg ? "透明背景" : "負向提示詞"]) : [];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #06100d 0%, #0b1a16 55%, #0f2a23 100%)", color: "#e8f5f0", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, letterSpacing: 6, color: "#7ff0cd" }}><span>THE BLUE WING</span><span>{page?.kind === "video" ? "影片模型" : "圖片模型"}</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>{name}</div>
          <div style={{ fontSize: 32, color: "#a9c9bf", lineHeight: 1.4 }}>{page?.tagline ?? ""}</div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 26 }}>{facts.map((f) => <span key={f} style={{ padding: "10px 22px", borderRadius: 999, border: "2px solid #2f6b58", color: "#7ff0cd" }}>{f}</span>)}</div>
      </div>
    ),
    size,
  );
}
