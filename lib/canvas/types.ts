/**
 * 智慧畫布 (Canvas) data model. Deliberately small — v1 ships only node types
 * backed by real, already-shipped API routes (/api/images, /api/videos, the
 * asset library). No Composite-Image layer editor, Font, Recording/TTS, or
 * Agent-as-tool-orchestrator nodes here: those either have no SIRAYA
 * equivalent in this app, or are a separate feature in their own right —
 * see app/canvas/page.tsx for the "coming later" list shown to the user.
 */

export type PortType = "text" | "image" | "video";

export type CanvasNodeType = "text" | "loadImage" | "image" | "video";

export type RunStatus = "idle" | "running" | "done" | "error";

export type NodeOutput =
  | { kind: "text"; text: string }
  | { kind: "image"; url: string; assetId?: number }
  | { kind: "video"; url: string };

export interface CanvasNode {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
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
};

export const NODE_TYPES: CanvasNodeType[] = ["text", "loadImage", "image", "video"];

/** Fixed layout constants shared by node rendering and edge-path math. */
export const NODE_WIDTH = 240;
export const NODE_HEADER_H = 40;
export const NODE_PORT_ROW_H = 26;

export function defaultNodeData(type: CanvasNodeType): Record<string, unknown> {
  switch (type) {
    case "text":
      return { text: "" };
    case "loadImage":
      return { assetId: null, src: null, name: null };
    case "image":
      return { model: "ByteDance-Seedream-4.0", prompt: "", size: "1024x1024" };
    case "video":
      return { model: "SIRAYA-Seedance-2.0-mini", prompt: "", seconds: 5, resolution: "480p" };
  }
}

let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}
