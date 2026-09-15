import { IMAGE_MODELS, getImageModel, sizeOptionsFor, supportsRefImages } from "../imageModels";
import { getGenerationModes } from "../generationModes";
import { maxRefsForVideoModel, supportsVideoRefInput, videoConstraintFor } from "../videoModels";
import { creditCostFromRate } from "../creditFormula";
import { modelLabel } from "../modelLabel";
import type { ModelRate } from "../rateCard";
import { k } from "../i18n/k";

/**
 * The public /models/[slug] catalogue. Facts (sizes, resolutions, durations,
 * reference limits, generation modes) are read from the same helpers the
 * studio uses, so the page can never drift from what the product actually
 * accepts; only the editorial copy lives here. `updatedAt` feeds the
 * sitemap's lastmod — bump it when a model's copy or limits change.
 */
export interface ModelPage {
  slug: string;
  id: string;
  kind: "image" | "video";
  /** who makes the underlying model — public knowledge, useful for search ("Google Veo") */
  vendor: string;
  tagline: string;
  blurb: string;
  bestFor: string[];
  notFor: string[];
  updatedAt: string;
}

const D = "2026-09-15";

export const MODEL_PAGES: ModelPage[] = [
  // ---- video ----
  { slug: "seedance-2-5", id: "SIRAYA-Seedance-2.5", kind: "video", vendor: "ByteDance", updatedAt: D,
    tagline: k("讓角色、場景與鏡頭，共同說一段故事。"),
    blurb: k("從角色參考開始，安排場景、動作與鏡頭之間的關係。適合需要延續人物設定，或串起多個畫面想法的短片。"),
    bestFor: [k("多主體一致性（多張角色／場景參考圖）"), k("指定運鏡（用 3D 導演台錄製的參考影片）"), k("10 秒以上的長鏡頭"), k("首尾幀之間的過場")],
    notFor: [k("需要 4K 輸出（可考慮 Seedance 2.0）"), k("只想快速出短片預覽（Seedance 2.0 mini 更便宜更快）")] },
  { slug: "seedance-2-0", id: "SIRAYA-Seedance-2.0", kind: "video", vendor: "ByteDance", updatedAt: D,
    tagline: k("為光影、動作與細節，留出表現的空間。"),
    blurb: k("從文字或圖片出發，製作角色短片、產品展示與場景片段。需要較高解析度的作品，可以在這裡繼續細修。"),
    bestFor: [k("1080p / 4K 成品輸出"), k("首尾幀控制的產品展示或轉場"), k("圖生影（用一張圖起手）")],
    notFor: [k("超過 15 秒的單一鏡頭（請用 Seedance 2.5）"), k("需要 50 個參考素材的複雜場景")] },
  { slug: "seedance-2-0-fast", id: "SIRAYA-Seedance-2.0-fast", kind: "video", vendor: "ByteDance", updatedAt: D,
    tagline: k("先看見節奏，再決定故事的樣子。"),
    blurb: k("適合在定稿前比較不同構圖與動作描述。把想法分成幾個版本，逐一觀看，再選擇值得延伸的方向。"),
    bestFor: [k("快速試提示詞、找構圖"), k("社群短影音（720p 足夠）")],
    notFor: [k("1080p 以上成品"), k("長鏡頭")] },
  { slug: "seedance-2-0-mini", id: "SIRAYA-Seedance-2.0-mini", kind: "video", vendor: "ByteDance", updatedAt: D,
    tagline: k("把腦中的片段，先拍成一份草稿。"),
    blurb: k("用於分鏡探索、角色動態與短片練習。先確認畫面方向，再決定後續的製作方式。"),
    bestFor: [k("第一次嘗試影片生成"), k("大量出草稿、挑最好的再重做"), k("角色待機動態、頭像動起來")],
    notFor: [k("最終交付的高畫質成品")] },
  { slug: "seedance-1-5-pro", id: "ByteDance-Seedance-1.5-pro", kind: "video", vendor: "ByteDance", updatedAt: D,
    tagline: k("從一張畫面，延伸出自然的過場。"),
    blurb: k("以文字、起始圖片或首尾畫面安排短片，適合單一場景的動作與轉場練習。"),
    bestFor: [k("單張圖片起手的短片"), k("首尾幀之間的自然過渡")],
    notFor: [k("多張參考圖的角色一致性"), k("影片參考運鏡")] },
  { slug: "seedance-1-0-pro", id: "ByteDance-Seedance-1.0-pro", kind: "video", vendor: "ByteDance", updatedAt: D,
    tagline: k("用一段描述，開始一個鏡頭。"),
    blurb: k("適合從簡單場景與單一動作開始，觀察文字如何轉化為畫面。"),
    bestFor: [k("純文字描述的短片"), k("預算有限的批量產出")],
    notFor: [k("首尾幀、主體參考、運鏡參考")] },
  { slug: "seedance-1-0-pro-fast", id: "ByteDance-Seedance-1.0-pro-fast", kind: "video", vendor: "ByteDance", updatedAt: D,
    tagline: k("多試幾種構圖，找到想留下的那一幕。"),
    blurb: k("用於構思初期的短片練習與版本比較，先整理方向，再進一步製作。"),
    bestFor: [k("最低成本試錯"), k("教學或練習提示詞")],
    notFor: [k("需要精細控制的正式作品")] },
  { slug: "veo-3-1", id: "veo-3.1-generate-001", kind: "video", vendor: "Google", updatedAt: D,
    tagline: k("讓畫面之外，也有風聲與回響。"),
    blurb: k("把環境聲、音效或對白寫進場景描述，探索有聲片段的氛圍。人物與鏡頭要求仍需在成片後逐一檢視。"),
    bestFor: [k("有聲短片、需要環境音或對白"), k("寫實電影感畫面"), k("4K 成品")],
    notFor: [k("需要參考圖維持角色一致"), k("首尾幀控制")] },
  { slug: "happyhorse-1-1-t2v", id: "happyhorse-1.1-t2v", kind: "video", vendor: "Happyhorse", updatedAt: D,
    tagline: k("從文字裡，找到動作的輪廓。"),
    blurb: k("適合以文字描述場景、人物動作與畫風，探索不同的動態表現。"),
    bestFor: [k("風格化、動畫感的短片"), k("純文字描述出片")],
    notFor: [k("參考素材與首尾幀")] },
  { slug: "happyhorse-1-1-i2v", id: "happyhorse-1.1-i2v", kind: "video", vendor: "Happyhorse", updatedAt: D,
    tagline: k("讓插畫中的風，開始吹動。"),
    blurb: k("以單張圖片作為起點，安排細微動態或鏡頭移動，延伸原本的構圖。"),
    bestFor: [k("插畫、海報動態化"), k("產品圖轉短影音")],
    notFor: [k("多張參考圖"), k("純文字描述（請用 t2v）")] },
  { slug: "happyhorse-1-0-t2v", id: "happyhorse-1.0-t2v", kind: "video", vendor: "Happyhorse", updatedAt: D,
    tagline: k("一句場景描述，一段新的片刻。"),
    blurb: k("從文字出發製作短片，適合比較場景、光線與動作的不同安排。"),
    bestFor: [k("穩定的文字生影片")], notFor: [k("參考素材"), k("480p 低成本草稿")] },
  { slug: "happyhorse-1-0-i2v", id: "happyhorse-1.0-i2v", kind: "video", vendor: "Happyhorse", updatedAt: D,
    tagline: k("替靜止的畫面，添上一點時間。"),
    blurb: k("從單張圖片延伸動態，適合海報、插畫與產品畫面的短片嘗試。"),
    bestFor: [k("單張圖片動態化")], notFor: [k("多張參考圖"), k("480p 草稿")] },
  // ---- image ----
  { slug: "gpt-image-2-5-sunburst", id: "gpt-image-2.5-sunburst", kind: "image", vendor: "OpenAI", updatedAt: D,
    tagline: k("把構圖、字句與細節，慢慢修到合意。"),
    blurb: k("用於海報、封面與參考圖編修。將需要保留與修改的部分分開描述，逐步整理畫面。"),
    bestFor: [k("海報、封面等需要正確文字的畫面"), k("透明背景素材（PNG）"), k("用參考圖做局部修改、換風格"), k("4K 直式或橫式輸出")],
    notFor: [k("需要幾秒內出圖的快速草稿（請用 Seedream 或 Gemini flash）"), k("負向提示詞（此模型不支援）")] },
  { slug: "gpt-image-2", id: "gpt-image-2", kind: "image", vendor: "OpenAI", updatedAt: D,
    tagline: k("保留原來的想法，試另一種畫法。"),
    blurb: k("適合與其他版本比較構圖與畫風，也可從參考圖片延伸修改方向。"),
    bestFor: [k("與 2.5 對照畫風"), k("透明背景與文字排版")], notFor: [k("快速草稿")] },
  { slug: "seedream-5-0-pro", id: "Dola-Seedream-5.0-pro", kind: "image", vendor: "ByteDance", updatedAt: D,
    tagline: k("在材質與光線之間，雕琢一張主視覺。"),
    blurb: k("從角色、場景與色彩關係出發，製作主視覺與設計稿。以參考圖說明想保留的元素，再逐步細修。"),
    bestFor: [k("高質感主視覺"), k("角色與場景設計稿"), k("中文提示詞的語意理解")],
    notFor: [k("1024 以下的小圖（最小輸出 2K）"), k("透明背景")] },
  { slug: "seedream-5-0-lite", id: "Dola-Seedream-5.0-lite", kind: "image", vendor: "ByteDance", updatedAt: D,
    tagline: k("為同一個想法，多留幾張選稿。"),
    blurb: k("適合構思初期的版本探索，比較構圖、色調與場景，再挑選方向。"),
    bestFor: [k("批量出圖、選稿"), k("2K 社群圖")], notFor: [k("圖層分離"), k("透明背景")] },
  { slug: "seedream-4-5", id: "ByteDance-Seedream-4.5", kind: "image", vendor: "ByteDance", updatedAt: D,
    tagline: k("整理畫面層次，留下細節的餘韻。"),
    blurb: k("以文字或參考圖安排人物與場景，適合插畫、封面與日常視覺設計。"),
    bestFor: [k("2K 通用生圖")], notFor: [k("1024 小圖"), k("透明背景")] },
  { slug: "seedream-4-0", id: "ByteDance-Seedream-4.0", kind: "image", vendor: "ByteDance", updatedAt: D,
    tagline: k("從草圖開始，讓想法逐漸清楚。"),
    blurb: k("適合分鏡、構圖練習與畫布中的前期選稿。"),
    bestFor: [k("快速草稿、分鏡"), k("智慧畫布批量節點")], notFor: [k("4K 輸出"), k("透明背景")] },
  { slug: "gemini-3-pro-image", id: "gemini-3-pro-image", kind: "image", vendor: "Google", updatedAt: D,
    tagline: k("讓畫面中的每個元素，都有自己的位置。"),
    blurb: k("適合需要安排多個物件與文字的構圖。清楚描述主次關係，逐步調整版面。"),
    bestFor: [k("複雜場景、多物件構圖"), k("圖文混排")], notFor: [k("快速草稿"), k("透明背景")] },
  { slug: "gemini-3-1-flash-image", id: "gemini-3.1-flash-image", kind: "image", vendor: "Google", updatedAt: D,
    tagline: k("換一處細節，看看畫面的新可能。"),
    blurb: k("從參考圖片出發，嘗試局部修改、版面安排與不同色彩。"),
    bestFor: [k("局部編修"), k("快速但要求版面的生圖")], notFor: [k("4K"), k("透明背景")] },
  { slug: "gemini-3-1-flash-lite-image", id: "gemini-3.1-flash-lite-image", kind: "image", vendor: "Google", updatedAt: D,
    tagline: k("輕裝開始，盡情試稿。"),
    blurb: k("用於構圖探索與版本比較，先找出喜歡的方向，再繼續細化。"),
    bestFor: [k("最低成本草稿")], notFor: [k("高品質成品")] },
  { slug: "gemini-2-5-flash-image", id: "gemini-2.5-flash-image", kind: "image", vendor: "Google", updatedAt: D,
    tagline: k("沿著原圖的線索，繼續創作。"),
    blurb: k("以參考圖片延伸內容，安排局部修改與圖文構圖。"),
    bestFor: [k("局部編修"), k("圖文混合")], notFor: [k("4K"), k("透明背景")] },
];

export function modelPageBySlug(slug: string): ModelPage | undefined {
  return MODEL_PAGES.find((m) => m.slug === slug);
}

export function modelPageName(page: ModelPage): string {
  return modelLabel(page.id);
}

export interface ModelSpecs {
  modes: string[];
  resolutions: string[];
  sizes: string[];
  maxSeconds: number | null;
  maxRefs: number;
  videoRef: boolean;
  refImages: boolean;
  negativePrompt: boolean;
  transparentBg: boolean;
  quality: boolean;
}

/** Everything the studio would let a user set for this model, read from the real helpers. */
export function modelSpecs(page: ModelPage): ModelSpecs {
  if (page.kind === "video") {
    const c = videoConstraintFor(page.id);
    const modes = getGenerationModes(page.id, "video").filter((m) => m.enabled).map((m) => m.label);
    return { modes: modes.length ? modes : [/i2v/i.test(page.id) ? "圖片生影片" : "文字生影片"], resolutions: c.resolutions, sizes: [], maxSeconds: c.maxSeconds, maxRefs: maxRefsForVideoModel(page.id), videoRef: supportsVideoRefInput(page.id), refImages: maxRefsForVideoModel(page.id) > 0, negativePrompt: false, transparentBg: false, quality: false };
  }
  const m = getImageModel(page.id);
  const keys = new Set(m?.controls.map((c) => c.key) ?? []);
  return { modes: getGenerationModes(page.id, "image").filter((x) => x.enabled).map((x) => x.label), resolutions: [], sizes: sizeOptionsFor(page.id), maxSeconds: null, maxRefs: supportsRefImages(m) ? 4 : 0, videoRef: false, refImages: supportsRefImages(m), negativePrompt: keys.has("negative_prompt"), transparentBg: keys.has("background"), quality: keys.has("quality") };
}

export interface ModelPricing {
  perUnit: number;
  unit: "張" | "秒";
  /** worked examples the page shows, e.g. 5 秒 480p */
  examples: { label: string; vars?: Record<string, string | number>; credits: number }[];
}

export function modelPricing(page: ModelPage, rates: ModelRate[]): ModelPricing | null {
  const rate = rates.find((r) => r.modelId.toLowerCase() === page.id.toLowerCase() && r.active);
  if (!rate) return null;
  if (page.kind === "image") {
    return { perUnit: rate.credits, unit: "張", examples: [{ label: k("1 張"), credits: creditCostFromRate({ modality: "image", credits: rate.credits, imageCount: 1 }) }, { label: k("4 張"), credits: creditCostFromRate({ modality: "image", credits: rate.credits, imageCount: 4 }) }] };
  }
  const specs = modelSpecs(page);
  const examples = specs.resolutions.slice(0, 3).map((res) => ({ label: k("5 秒 {res}"), vars: { res }, credits: creditCostFromRate({ modality: "video", credits: rate.credits, seconds: 5, resolution: res }) }));
  return { perUnit: rate.credits, unit: "秒", examples };
}

/** Sanity: every curated image entry should exist in the studio catalogue. */
export const UNCATALOGUED = MODEL_PAGES.filter((p) => p.kind === "image" && !IMAGE_MODELS.some((m) => m.id === p.id)).map((p) => p.id);
