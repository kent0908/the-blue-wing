export type Mode = "image" | "video" | "text" | "audio";

export interface ModelInfo {
  id: string;
  ownedBy: string;
  created: number | null;
  modality: "text" | "image" | "video";
}

export interface GenSettings {
  aspectRatio: string; // "auto" | "1:1" | ...
  resolution: string; // "480p" | "720p" | "1080p"
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
export const RESOLUTIONS = ["480p", "720p", "1080p"];
export const IMAGE_SIZES = ["1024x1024", "1024x1536", "1536x1024", "1792x1024"];

export const MODE_LABELS: Record<Mode, string> = {
  image: "智慧生圖",
  video: "智慧影片",
  text: "多輪對話",
  audio: "語音",
};

export interface ResultItem {
  id: string;
  kind: "image" | "video" | "text";
  url?: string;
  text?: string;
  prompt: string;
  model: string;
  createdAt: number;
}
