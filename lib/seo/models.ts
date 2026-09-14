import { IMAGE_MODELS, getImageModel, sizeOptionsFor, supportsRefImages } from "../imageModels";
import { getGenerationModes } from "../generationModes";
import { maxRefsForVideoModel, supportsVideoRefInput, videoConstraintFor } from "../videoModels";
import { creditCostFromRate } from "../creditFormula";
import { modelLabel } from "../modelLabel";
import type { ModelRate } from "../rateCard";

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
    tagline: "目前最完整的影片模型：最長 30 秒、最多 50 個參考素材、支援影片參考運鏡。",
    blurb: "Seedance 2.5 是 Seedance 系列的最新版本。它接受圖片、影片與音訊當參考素材（一次最多 50 個），可以把 3D 導演台錄下的運鏡直接當「參考影片」餵進去，輸出 480p 或 720p、4 到 30 秒。適合需要多個角色或物件保持一致、或想精準控制鏡頭運動的專案。",
    bestFor: ["多主體一致性（多張角色／場景參考圖）", "指定運鏡（用 3D 導演台錄製的參考影片）", "10 秒以上的長鏡頭", "首尾幀之間的過場"],
    notFor: ["需要 1080p 或 4K 輸出（請用 Seedance 2.0）", "只想快速出短片預覽（Seedance 2.0 mini 更便宜更快）"] },
  { slug: "seedance-2-0", id: "SIRAYA-Seedance-2.0", kind: "video", vendor: "ByteDance", updatedAt: D,
    tagline: "支援到 4K 的主力影片模型，首尾幀與主體參考都能用。",
    blurb: "Seedance 2.0 是輸出解析度最高的 Seedance 版本：480p、720p、1080p 到 4K，最長 15 秒。支援自由創作、首尾幀編輯與主體參考，最多 6 個參考素材。要交付高畫質成品時選它。",
    bestFor: ["1080p / 4K 成品輸出", "首尾幀控制的產品展示或轉場", "圖生影（用一張圖起手）"],
    notFor: ["超過 15 秒的單一鏡頭（請用 Seedance 2.5）", "需要 50 個參考素材的複雜場景"] },
  { slug: "seedance-2-0-fast", id: "SIRAYA-Seedance-2.0-fast", kind: "video", vendor: "ByteDance", updatedAt: D,
    tagline: "Seedance 2.0 的加速版：同樣的功能，更短的等待。",
    blurb: "Seedance 2.0 fast 保留 2.0 的自由創作、首尾幀與主體參考，輸出 480p 或 720p，最長 15 秒，生成時間明顯縮短、點數也較低。適合反覆迭代提示詞的階段。",
    bestFor: ["快速試提示詞、找構圖", "社群短影音（720p 足夠）"],
    notFor: ["1080p 以上成品", "長鏡頭"] },
  { slug: "seedance-2-0-mini", id: "SIRAYA-Seedance-2.0-mini", kind: "video", vendor: "ByteDance", updatedAt: D,
    tagline: "最省點數的 Seedance：預覽、草稿、陪聊角色動態都用它。",
    blurb: "Seedance 2.0 mini 是站上預設的影片模型：每秒點數最低，輸出 480p 或 720p，最長 15 秒，同樣支援首尾幀與主體參考。陪聊角色的待機動態影片就是用它生成的。先用 mini 確認方向，再用 2.0 或 2.5 出成品，是最省的工作流。",
    bestFor: ["第一次嘗試影片生成", "大量出草稿、挑最好的再重做", "角色待機動態、頭像動起來"],
    notFor: ["最終交付的高畫質成品"] },
  { slug: "seedance-1-5-pro", id: "ByteDance-Seedance-1.5-pro", kind: "video", vendor: "ByteDance", updatedAt: D,
    tagline: "上一代 Pro 版：文生影、圖生影與首尾幀，最高 1080p。",
    blurb: "Seedance 1.5 pro 支援文字生影片、圖片生影片與首尾幀編輯，輸出 480p 到 1080p，最長 12 秒。它不接受額外的參考素材（主體參考請用 2.0 以上），但畫面風格穩定、點數適中。",
    bestFor: ["單張圖片起手的短片", "首尾幀之間的自然過渡"],
    notFor: ["多張參考圖的角色一致性", "影片參考運鏡"] },
  { slug: "seedance-1-0-pro", id: "ByteDance-Seedance-1.0-pro", kind: "video", vendor: "ByteDance", updatedAt: D,
    tagline: "經典版：文生影與圖生影，最高 1080p。",
    blurb: "Seedance 1.0 pro 提供文字生影片與圖片生影片，輸出 480p 到 1080p，最長 12 秒。沒有首尾幀與參考素材功能，但價格低、風格乾淨，適合單純的文字描述出片。",
    bestFor: ["純文字描述的短片", "預算有限的批量產出"],
    notFor: ["首尾幀、主體參考、運鏡參考"] },
  { slug: "seedance-1-0-pro-fast", id: "ByteDance-Seedance-1.0-pro-fast", kind: "video", vendor: "ByteDance", updatedAt: D,
    tagline: "站上最便宜的影片模型：每秒 4 點。",
    blurb: "Seedance 1.0 pro fast 是 1.0 pro 的加速版，功能相同（文生影、圖生影，480p–1080p，最長 12 秒），生成最快、點數最低。適合先大量試、再決定要不要用更高階模型重做。",
    bestFor: ["最低成本試錯", "教學或練習提示詞"],
    notFor: ["需要精細控制的正式作品"] },
  { slug: "veo-3-1", id: "veo-3.1-generate-001", kind: "video", vendor: "Google", updatedAt: D,
    tagline: "Google 的旗艦影片模型：原生音軌、電影感畫面，最高 4K。",
    blurb: "Veo 3.1 會同時生成畫面與聲音（環境音、音效、對白），輸出 720p、1080p 或 4K。畫面的光影與物理表現偏電影質感，適合需要「一次到位」有聲片段的場合。目前走標準文字生影片流程，不接受參考素材。",
    bestFor: ["有聲短片、需要環境音或對白", "寫實電影感畫面", "4K 成品"],
    notFor: ["需要參考圖維持角色一致", "首尾幀控制"] },
  { slug: "happyhorse-1-1-t2v", id: "happyhorse-1.1-t2v", kind: "video", vendor: "Happyhorse", updatedAt: D,
    tagline: "Happyhorse 1.1 文生影：動作流暢、風格化強。",
    blurb: "Happyhorse 1.1 t2v 從純文字生成影片，輸出 480p、720p 或 1080p。動作連貫性與風格化表現是它的強項，適合動畫感、產品動態或抽象視覺。",
    bestFor: ["風格化、動畫感的短片", "純文字描述出片"],
    notFor: ["參考素材與首尾幀"] },
  { slug: "happyhorse-1-1-i2v", id: "happyhorse-1.1-i2v", kind: "video", vendor: "Happyhorse", updatedAt: D,
    tagline: "Happyhorse 1.1 圖生影：讓一張圖動起來。",
    blurb: "Happyhorse 1.1 i2v 以一張圖片為起點生成影片，輸出 480p、720p 或 1080p。適合把插畫、海報或產品圖變成動態版本。",
    bestFor: ["插畫、海報動態化", "產品圖轉短影音"],
    notFor: ["多張參考圖", "純文字描述（請用 t2v）"] },
  { slug: "happyhorse-1-0-t2v", id: "happyhorse-1.0-t2v", kind: "video", vendor: "Happyhorse", updatedAt: D,
    tagline: "Happyhorse 1.0 文生影，720p / 1080p。",
    blurb: "Happyhorse 1.0 t2v 是上一代文字生影片模型，輸出 720p 或 1080p。與 1.1 相比風格略保守，適合穩定輸出。",
    bestFor: ["穩定的文字生影片"], notFor: ["參考素材", "480p 低成本草稿"] },
  { slug: "happyhorse-1-0-i2v", id: "happyhorse-1.0-i2v", kind: "video", vendor: "Happyhorse", updatedAt: D,
    tagline: "Happyhorse 1.0 圖生影，720p / 1080p。",
    blurb: "Happyhorse 1.0 i2v 從單張圖片生成影片，輸出 720p 或 1080p。",
    bestFor: ["單張圖片動態化"], notFor: ["多張參考圖", "480p 草稿"] },
  // ---- image ----
  { slug: "gpt-image-2-5-sunburst", id: "gpt-image-2.5-sunburst", kind: "image", vendor: "OpenAI", updatedAt: D,
    tagline: "站上預設的圖片模型：文字排版準、參考圖編修強、可輸出透明背景與 4K。",
    blurb: "GPT image 2.5 sunburst 是 OpenAI 最新一代生圖模型，也是 The Blue Wing 的預設選擇。它對長提示詞與畫面中的文字最可靠，支援品質檔位（低／中／高）、透明背景輸出、壓縮率設定，尺寸從 1024×1024 到 3840×2160 / 2160×3840。附上參考圖時走編修流程，能保留原圖結構做局部修改。生成時間較長（常超過 60 秒）。",
    bestFor: ["海報、封面等需要正確文字的畫面", "透明背景素材（PNG）", "用參考圖做局部修改、換風格", "4K 直式或橫式輸出"],
    notFor: ["需要幾秒內出圖的快速草稿（請用 Seedream 或 Gemini flash）", "負向提示詞（此模型不支援）"] },
  { slug: "gpt-image-2", id: "gpt-image-2", kind: "image", vendor: "OpenAI", updatedAt: D,
    tagline: "上一代 GPT image：同樣的參數與尺寸，風格略有不同。",
    blurb: "GPT image 2 與 2.5 sunburst 共用同一組控制項（品質、背景、壓縮率、到 4K 的尺寸）與參考圖編修流程。若你習慣 2 代的畫風，或想比較兩代輸出，可以直接切換。",
    bestFor: ["與 2.5 對照畫風", "透明背景與文字排版"], notFor: ["快速草稿"] },
  { slug: "seedream-5-0-pro", id: "Dola-Seedream-5.0-pro", kind: "image", vendor: "ByteDance", updatedAt: D,
    tagline: "生產級生圖：質感與提示詞跟隨度最佳，獨家支援圖層分離。",
    blurb: "Seedream 5.0 pro 是 Seedream 系列的旗艦，輸出 2K 以上（2048×2048、2560×1440、1440×2560、2304×1728），支援負向提示詞與隨機種子，接受參考圖。它是站上唯一提供「圖層分離」的模型——把一張圖拆成可獨立編輯的圖層，直接送進圖層編輯器。",
    bestFor: ["高質感主視覺", "需要拆圖層再後製的設計稿", "中文提示詞的語意理解"],
    notFor: ["1024 以下的小圖（最小輸出 2K）", "透明背景"] },
  { slug: "seedream-5-0-lite", id: "Dola-Seedream-5.0-lite", kind: "image", vendor: "ByteDance", updatedAt: D,
    tagline: "第五代輕量版：2K 輸出、速度快、點數低。",
    blurb: "Seedream 5.0 lite 輸出 2K 以上，支援負向提示詞、種子與參考圖，速度與價格都比 pro 友善。適合大量出圖再挑選。",
    bestFor: ["批量出圖、選稿", "2K 社群圖"], notFor: ["圖層分離", "透明背景"] },
  { slug: "seedream-4-5", id: "ByteDance-Seedream-4.5", kind: "image", vendor: "ByteDance", updatedAt: D,
    tagline: "4.0 的升級版：細節與構圖更完整，2K 起跳。",
    blurb: "Seedream 4.5 輸出 2K 以上，支援負向提示詞、種子與參考圖。相較 4.0，細節與構圖完整度提升。",
    bestFor: ["2K 通用生圖"], notFor: ["1024 小圖", "透明背景"] },
  { slug: "seedream-4-0", id: "ByteDance-Seedream-4.0", kind: "image", vendor: "ByteDance", updatedAt: D,
    tagline: "高性價比通用生圖，1024 起跳、中文語意穩定。",
    blurb: "Seedream 4.0 是站上最便宜的圖片模型之一，輸出 1024×1024、1792×1024、1024×1792，支援負向提示詞、種子與參考圖，智慧畫布的圖片節點預設用它。",
    bestFor: ["快速草稿、分鏡", "智慧畫布批量節點"], notFor: ["4K 輸出", "透明背景"] },
  { slug: "gemini-3-pro-image", id: "gemini-3-pro-image", kind: "image", vendor: "Google", updatedAt: D,
    tagline: "Gemini 生圖旗艦：複雜場景與文字排版最穩，生成較慢。",
    blurb: "Gemini 3 pro image 擅長多元素的複雜構圖與畫面中的文字，接受參考圖做圖文混合編修。生成時間較長。",
    bestFor: ["複雜場景、多物件構圖", "圖文混排"], notFor: ["快速草稿", "透明背景"] },
  { slug: "gemini-3-1-flash-image", id: "gemini-3.1-flash-image", kind: "image", vendor: "Google", updatedAt: D,
    tagline: "新一代 Flash 生圖：指令理解與版面控制更強。",
    blurb: "Gemini 3.1 flash image 在速度與品質間取得平衡，接受參考圖，適合局部編修與版面調整。",
    bestFor: ["局部編修", "快速但要求版面的生圖"], notFor: ["4K", "透明背景"] },
  { slug: "gemini-3-1-flash-lite-image", id: "gemini-3.1-flash-lite-image", kind: "image", vendor: "Google", updatedAt: D,
    tagline: "最省的 Gemini 生圖檔位，適合大量草稿。",
    blurb: "Gemini 3.1 flash lite image 是站上點數最低的圖片模型，接受參考圖，適合大量草稿與構圖探索。",
    bestFor: ["最低成本草稿"], notFor: ["高品質成品"] },
  { slug: "gemini-2-5-flash-image", id: "gemini-2.5-flash-image", kind: "image", vendor: "Google", updatedAt: D,
    tagline: "Google 多模態生圖，適合圖文混合與局部編修。",
    blurb: "Gemini 2.5 flash image 接受參考圖，擅長依指令做局部修改與圖文混合。",
    bestFor: ["局部編修", "圖文混合"], notFor: ["4K", "透明背景"] },
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
  examples: { label: string; credits: number }[];
}

export function modelPricing(page: ModelPage, rates: ModelRate[]): ModelPricing | null {
  const rate = rates.find((r) => r.modelId.toLowerCase() === page.id.toLowerCase() && r.active);
  if (!rate) return null;
  if (page.kind === "image") {
    return { perUnit: rate.credits, unit: "張", examples: [{ label: "1 張", credits: creditCostFromRate({ modality: "image", credits: rate.credits, imageCount: 1 }) }, { label: "4 張", credits: creditCostFromRate({ modality: "image", credits: rate.credits, imageCount: 4 }) }] };
  }
  const specs = modelSpecs(page);
  const examples = specs.resolutions.slice(0, 3).map((res) => ({ label: `5 秒 ${res}`, credits: creditCostFromRate({ modality: "video", credits: rate.credits, seconds: 5, resolution: res }) }));
  return { perUnit: rate.credits, unit: "秒", examples };
}

/** Sanity: every curated image entry should exist in the studio catalogue. */
export const UNCATALOGUED = MODEL_PAGES.filter((p) => p.kind === "image" && !IMAGE_MODELS.some((m) => m.id === p.id)).map((p) => p.id);
