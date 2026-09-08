export type Mode = "image" | "video" | "text" | "audio";

export interface ModelInfo {
  id: string;
  ownedBy: string;
  created: number | null;
  modality: "text" | "image" | "video";
  /** admin-overridable label (see lib/modelDisplay.ts) — prefer this over the raw id/catalogue name everywhere a model list is rendered. */
  displayName?: string;
  /** admin-set explicit order, if any — /api/models already returns the list pre-sorted, this is only here in case a caller needs to re-sort a filtered subset. */
  sortOrder?: number | null;
}

export interface GenSettings {
  aspectRatio: string; // "auto" | "1:1" | ...
  resolution: string; // Model-specific: "480p" | "720p" | "1080p" | "4k"
  seconds: number;
  imageCount: number;
  size: string; // for images, e.g. 1024x1024
  maxTokens: number;
}

export const DEFAULT_SETTINGS: GenSettings = {
  aspectRatio: "auto",
  resolution: "480p",
  seconds: 4,
  imageCount: 1,
  size: "1024x1024",
  maxTokens: 1024,
};

export const ASPECT_RATIOS = ["auto", "1:1", "3:4", "4:3", "9:16", "16:9", "21:9"];
// Removed IMAGE_SIZES and RESOLUTIONS (2026-09-07 data-accuracy audit): both
// were one flat list shared by every model regardless of which one was
// selected — IMAGE_SIZES mixed Seedream/DALL·E-style sizes (1792x1024) with
// GPT Image's real ones (1024x1536, 1536x1024) into a list no model fully
// accepts; RESOLUTIONS offered 1080p/4k combinations several Seedance
// versions actually reject (the exact bug this whole audit started from).
// See lib/imageModels.ts's sizeOptionsFor() and lib/videoModels.ts's
// videoConstraintFor() for the real per-model lists.

export const MODE_LABELS: Record<Mode, string> = {
  image: "智慧生圖",
  video: "智慧影片",
  text: "多輪對話",
  audio: "語音",
};

export interface ResultItem {
  layerSetId?: string;
  id: string;
  kind: "image" | "video" | "text";
  url?: string;
  text?: string;
  prompt: string;
  model: string;
  createdAt: number;
}

/**
 * An in-flight generation. SIRAYA has no batch endpoint (checked the docs) —
 * "generate several at once" just means not blocking new submissions on the
 * one currently running, since each submission (video: async job id +
 * independent polling; image: a plain synchronous call) is already
 * independent of any other. See app/studio/page.tsx.
 */
export interface PendingJob {
  id: string;
  mode: Mode;
  kind: "image" | "video" | "text";
  model: string;
  prompt: string;
  startedAt: number;
  stage: number;
  error?: string | null;
  errorCta?: { href: string; label: string } | null;
}
