/**
 * 智慧畫布 (Canvas) data model. Deliberately small — v1 ships only node types
 * backed by real, already-shipped API routes (/api/images, /api/videos, the
 * asset library). No Composite-Image layer editor, Font, Recording/TTS, or
 * Agent-as-tool-orchestrator nodes here: those either have no SIRAYA
 * equivalent in this app, or are a separate feature in their own right —
 * see app/canvas/page.tsx for the "coming later" list shown to the user.
 */
import { defaultDirector3DData } from "./director3d";

export type PortType = "text" | "image" | "video";

export type CanvasNodeType = "text" | "loadImage" | "image" | "video" | "director3d";

export type RunStatus = "idle" | "running" | "done" | "error";

export interface ImageRef {
  url: string;
  /** present when this image came from the user's own asset library (Load
   *  Image node) — lets the server resolve it via the private blob store
   *  instead of needing a public URL. Absent for a chained node's own
   *  generated-image output. */
  assetId?: number;
}

export type NodeOutput =
  | { kind: "text"; text: string }
  | { kind: "image"; items: ImageRef[] }
  | { kind: "video"; url: string };

export interface CanvasNode {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  /** card width in px — the resize handle's drag target; falls back to NODE_WIDTH when unset (every node created before this existed). */
  width?: number;
  /** height cap (px) for this node's main text area (the "text" node's textarea, or a text-kind output preview) — same resize handle, other axis. Content beyond it scrolls instead of pushing the card taller, which is the whole point: a long prompt/output no longer forces every node below it down the canvas. */
  textHeight?: number;
  /** node-type-specific fields — see defaultNodeData() */
  data: Record<string, unknown>;
  status?: RunStatus;
  output?: NodeOutput | null;
  error?: string | null;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
}

export interface CanvasGraph {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface PortSpec {
  id: string;
  label: string;
  type: PortType;
}

export interface NodeSpec {
  type: CanvasNodeType;
  label: string;
  hint: string;
  inputs: PortSpec[];
  output: PortSpec;
}

export const NODE_SPECS: Record<CanvasNodeType, NodeSpec> = {
  text: {
    type: "text",
    label: "文字",
    hint: "手動輸入文字，接到其他節點當 prompt",
    inputs: [],
    output: { id: "out", label: "文字", type: "text" },
  },
  loadImage: {
    type: "loadImage",
    label: "讀取素材",
    hint: "從資產庫選一張圖，當其他節點的參考圖",
    inputs: [],
    output: { id: "out", label: "圖片", type: "image" },
  },
  image: {
    type: "image",
    label: "圖片生成",
    hint: "文生圖 / 圖生圖",
    inputs: [
      { id: "prompt", label: "Prompt", type: "text" },
      { id: "image", label: "參考圖", type: "image" },
    ],
    output: { id: "out", label: "圖片", type: "image" },
  },
  video: {
    type: "video",
    label: "影片生成",
    hint: "文生影片 / 圖生影片",
    inputs: [
      { id: "prompt", label: "Prompt", type: "text" },
      { id: "image", label: "參考圖", type: "image" },
    ],
    output: { id: "out", label: "影片", type: "video" },
  },
  director3d: {
    type: "director3d",
    label: "3D 導演台",
    hint: "在 3D 場景裡擺姿勢、調相機，截圖當參考圖",
    inputs: [],
    output: { id: "out", label: "截圖", type: "image" },
  },
};

export const NODE_TYPES: CanvasNodeType[] = ["text", "loadImage", "image", "video", "director3d"];

/** Fixed layout constants shared by node rendering and edge-path math. */
export const NODE_WIDTH = 240;
export const NODE_HEADER_H = 40;
export const NODE_PORT_ROW_H = 26;

/** Resize-handle bounds — see CanvasNode's width/textHeight. */
export const MIN_NODE_WIDTH = 200;
export const MAX_NODE_WIDTH = 520;
export const MIN_TEXT_HEIGHT = 72;
export const MAX_TEXT_HEIGHT = 480;
export const DEFAULT_TEXT_HEIGHT = 96;

export interface LoadImageItem {
  assetId: number;
  src: string;
  name: string;
}

export function defaultNodeData(type: CanvasNodeType): Record<string, unknown> {
  switch (type) {
    case "text":
      return { text: "" };
    case "loadImage":
      return { items: [] as LoadImageItem[] };
    case "image":
      return { model: "ByteDance-Seedream-4.0", prompt: "", size: "1024x1024" };
    case "video":
      return { model: "SIRAYA-Seedance-2.0-mini", prompt: "", seconds: 5, resolution: "480p" };
    case "director3d":
      return defaultDirector3DData() as unknown as Record<string, unknown>;
  }
}

let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}
