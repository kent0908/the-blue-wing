import type { ReactNode } from "react";
import type { CanvasGraph, CanvasNode, CanvasNodeType, NodeOutput } from "./types";

/** Presentation and execution stay shared; each workspace owns its APIs and billing. */
export interface CanvasEditorRuntime {
  kind: "business";
  apiBasePath: string;
  backHref: string;
  backLabel: string;
  billingNotice: string;
  initialView?: "canvas" | "director";
  showDirector?: boolean;
  allowedNodeTypes: CanvasNodeType[];
  videoModels?: { id: string; name: string }[];
  defaultNodeData: (type: CanvasNodeType) => Record<string, unknown>;
  renderNodeSettings: (node: CanvasNode, onChange: (patch: Record<string, unknown>) => void) => ReactNode | undefined;
  runNode: (node: CanvasNode, inputs: Record<string, CanvasNode | undefined>, signal?: AbortSignal) => Promise<NodeOutput>;
  /** Confirm the complete execution plan before the first paid request. */
  confirmRun: (graph: CanvasGraph, order: string[]) => Promise<boolean> | boolean;
}
