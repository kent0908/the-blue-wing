"use client";
import Image from "next/image";
import { OFFICIAL_CHARACTERS, officialCharacter } from "@/lib/canvas/officialCharacters";

import { modelLabel } from "@/lib/modelLabel";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { IconChevronLeft, IconPlus, IconPlay, IconTrash, IconImage, IconVideo, IconChat, IconAssets, IconAvatar } from "../Icons";
import Director3DPanel from "./director3d/Director3DPanel";
import type { Director3DSceneData } from "@/lib/canvas/director3d";
import {
  NODE_SPECS,
  NODE_TYPES,
  NODE_WIDTH,
  NODE_HEADER_H,
  NODE_PORT_ROW_H,
  MIN_NODE_WIDTH,
  MAX_NODE_WIDTH,
  MIN_TEXT_HEIGHT,
  MAX_TEXT_HEIGHT,
  DEFAULT_TEXT_HEIGHT,
  defaultNodeData,
  newId,
  type CanvasGraph,
  type CanvasNode,
  type CanvasNodeType,
  type PortType,
} from "@/lib/canvas/types";
import { topoOrder, upstreamOrder, executeGraph } from "@/lib/canvas/engine";
import { CanvasSaveState, CanvasRunLock } from "@/lib/canvas/saveState";
import { validateGraph } from "@/lib/canvas/validation";
import { canvasNodeCredits, canvasRunCredits } from "@/lib/canvas/cost";
import type { RateCardEntry } from "@/lib/pricing";
import { IMAGE_MODELS, sizeOptionsFor } from "@/lib/imageModels";
import { videoResolutionsForModel, normalizeVideoResolution, videoConstraintFor } from "@/lib/videoModels";

const PORT_COLOR: Record<PortType, string> = {
  text: "#7ea8ff",
  image: "#7ff0cd",
  video: "#f0b37f",
};

const NODE_ICON: Record<CanvasNodeType, (p: { className?: string }) => React.ReactElement> = {
  text: IconChat,
  loadImage: IconAssets,
  image: IconImage,
  video: IconVideo,
  director3d: IconAvatar,
};

interface AssetLite {
  id: number;
  src: string;
  name: string;
}

type Interaction =
  | { kind: "pan"; startClientX: number; startClientY: number; startPan: { x: number; y: number } }
  | { kind: "dragNode"; id: string; offsetX: number; offsetY: number }
  | { kind: "connect"; fromNode: string; fromPort: string; portType: PortType; x: number; y: number }
  | { kind: "resizeNode"; id: string; startClientX: number; startClientY: number; startWidth: number; startHeight: number }
  | null;

function outputPos(n: CanvasNode) {
  return { x: n.x + (n.width ?? NODE_WIDTH), y: n.y + NODE_HEADER_H / 2 };
}
function inputPos(n: CanvasNode, portId: string) {
  const idx = NODE_SPECS[n.type].inputs.findIndex((p) => p.id === portId);
  return { x: n.x, y: n.y + NODE_HEADER_H + Math.max(0, idx) * NODE_PORT_ROW_H + NODE_PORT_ROW_H / 2 };
}
function bezier(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = Math.max(50, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

function findInputPortAt(clientX: number, clientY: number): { nodeId: string; portId: string; type: PortType } | null {
  const els = document.elementsFromPoint(clientX, clientY);
  for (const el of els) {
    const target = (el as HTMLElement).closest?.('[data-port-kind="in"]') as HTMLElement | null;
    if (target?.dataset.nodeId && target.dataset.portId) {
      return { nodeId: target.dataset.nodeId, portId: target.dataset.portId, type: target.dataset.portType as PortType };
    }
  }
  return null;
}

export default function CanvasEditor({
  workflowId,
  initialName,
  initialGraph,
  initialVersion,
}: {
  workflowId: string;
  initialName: string;
  initialGraph: CanvasGraph;
  initialVersion: string;
}) {
  const [rates, setRates] = useState<RateCardEntry[]>([]);
  const [costDetails, setCostDetails] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () => fetch("/api/rates", { cache: "no-store" }).then(r => r.ok ? r.json() : { rates: [] }).then(j => { if (alive) setRates(j.rates ?? []); }).catch(() => { if (alive) setRates([]); });
    void refresh();
    window.addEventListener("focus", refresh);
    return () => { alive = false; window.removeEventListener("focus", refresh); };
  }, []);
  const [name, setName] = useState(initialName);
  const [graph, setGraph] = useState<CanvasGraph>(() => ({ ...initialGraph, nodes: initialGraph.nodes.map(n => n.status === "running" ? { ...n, status: "error", output: null, error: "上次執行已中斷，請確認生成紀錄後再執行" } : n) }));
  const [dirty, setDirty] = useState(initialGraph.nodes.some(n => n.status === "running"));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState] = useState(() => { const state = new CanvasSaveState(initialVersion); if (initialGraph.nodes.some(n => n.status === "running")) state.edit(); return state; });
  const [runLock] = useState(() => new CanvasRunLock());
  const runController = useRef<AbortController | null>(null);
  const nameRef = useRef(initialName);
  const [saving, setSaving] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 80, y: 60 });
  const [zoom, setZoom] = useState(1);
  const [interaction, setInteraction] = useState<Interaction>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [assetLibrary, setAssetLibrary] = useState<AssetLite[] | null>(null);
  const [videoModels, setVideoModels] = useState<{ id: string; name: string }[]>([]);
  const [director3dNodeId, setDirector3dNodeId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const graphRef = useRef(graph);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  const commitGraph = useCallback((next: CanvasGraph) => {
    graphRef.current = next;
    setGraph(next);
    saveState.edit();
    setDirty(saveState.dirty);
  }, [saveState]);
  const mutate = useCallback((fn: (g: CanvasGraph) => CanvasGraph) => {
    if (runLock.busy) return;
    const current = graphRef.current;
    let next = fn(current);
    const signature = (g: CanvasGraph) => JSON.stringify({ nodes: g.nodes.map(n => ({ id: n.id, type: n.type, data: n.data })), edges: g.edges });
    if (signature(current) !== signature(next)) {
      next = { ...next, nodes: next.nodes.map(n => ({ ...n, status: "idle", output: null, error: null })) };
    }
    commitGraph(next);
  }, [runLock, commitGraph]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (saveState.dirty || saveState.saving || runLock.busy) { e.preventDefault(); e.returnValue = ""; }
    };
    const leave = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || e.ctrlKey || e.metaKey || e.shiftKey || link.href === location.href) return;
      if ((saveState.dirty || saveState.saving || runLock.busy) && !confirm("畫布尚有未儲存內容或執行中的工作。確定離開？可先取消並儲存或匯出草稿。")) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", guard);
    document.addEventListener("click", leave, true);
    return () => { window.removeEventListener("beforeunload", guard); document.removeEventListener("click", leave, true); runController.current?.abort(); };
  }, [saveState, runLock]);

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panRef.current.x) / zoomRef.current,
      y: (clientY - rect.top - panRef.current.y) / zoomRef.current,
    };
  }, []);

  const ensureAssets = useCallback(() => {
    if (assetLibrary !== null) return;
    fetch("/api/assets")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((j: { assets: AssetLite[] }) => setAssetLibrary(j.assets))
      .catch(() => setAssetLibrary([]));
  }, [assetLibrary]);

  useEffect(() => {
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : { models: [] }))
      .then((j: { models: { id: string; modality: string; displayName?: string }[] }) =>
        // /api/models already returns them pre-sorted (grouped by family,
        // admin overrides honoured) — no reason to re-sort here too.
        setVideoModels(j.models.filter((m) => m.modality === "video" && !/nsfw/i.test(m.id)).map((m) => ({ id: m.id, name: modelLabel(m.displayName ?? m.id) })))
      )
      .catch(() => {});
  }, []);

  /* ---- pan / zoom / drag-node / connect-edge: one set of window listeners ---- */
  useEffect(() => {
    if (!interaction) return;

    const onMove = (e: PointerEvent) => {
      if (interaction.kind === "pan") {
        setPan({
          x: interaction.startPan.x + (e.clientX - interaction.startClientX),
          y: interaction.startPan.y + (e.clientY - interaction.startClientY),
        });
      } else if (interaction.kind === "dragNode") {
        const w = toWorld(e.clientX, e.clientY);
        const nx = w.x - interaction.offsetX;
        const ny = w.y - interaction.offsetY;
        mutate((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === interaction.id ? { ...n, x: nx, y: ny } : n)) }));
      } else if (interaction.kind === "connect") {
        const w = toWorld(e.clientX, e.clientY);
        setInteraction({ ...interaction, x: w.x, y: w.y });
      } else if (interaction.kind === "resizeNode") {
        // Divide by zoom — the drag happens in screen pixels, but width/textHeight
        // are stored in the canvas's own (unzoomed) world units.
        const dx = (e.clientX - interaction.startClientX) / zoomRef.current;
        const dy = (e.clientY - interaction.startClientY) / zoomRef.current;
        const width = Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, interaction.startWidth + dx));
        const textHeight = Math.min(MAX_TEXT_HEIGHT, Math.max(MIN_TEXT_HEIGHT, interaction.startHeight + dy));
        mutate((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === interaction.id ? { ...n, width, textHeight } : n)) }));
      }
    };

    const onUp = (e: PointerEvent) => {
      if (interaction.kind === "connect") {
        const hit = findInputPortAt(e.clientX, e.clientY);
        if (hit && hit.type === interaction.portType && hit.nodeId !== interaction.fromNode) {
          mutate((g) => ({
            ...g,
            edges: [
              ...g.edges.filter((ed) => !(ed.toNode === hit.nodeId && ed.toPort === hit.portId)),
              { id: newId("edge"), fromNode: interaction.fromNode, fromPort: interaction.fromPort, toNode: hit.nodeId, toPort: hit.portId },
            ],
          }));
        }
      }
      setInteraction(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [interaction, toWorld, mutate]);

  /* ---- wheel-to-zoom (native listener so preventDefault actually works) ---- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const worldX = (cx - panRef.current.x) / zoomRef.current;
      const worldY = (cy - panRef.current.y) / zoomRef.current;
      const next = Math.min(2, Math.max(0.3, zoomRef.current * (e.deltaY < 0 ? 1.1 : 0.9)));
      setZoom(next);
      setPan({ x: cx - worldX * next, y: cy - worldY * next });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* ---- delete key ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (selectedNode) {
        mutate((g) => ({
          nodes: g.nodes.filter((n) => n.id !== selectedNode),
          edges: g.edges.filter((ed) => ed.fromNode !== selectedNode && ed.toNode !== selectedNode),
        }));
        setSelectedNode(null);
      } else if (selectedEdge) {
        mutate((g) => ({ ...g, edges: g.edges.filter((ed) => ed.id !== selectedEdge) }));
        setSelectedEdge(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedNode, selectedEdge, mutate]);

  /* ---- save ---- */
  const save = async () => {
    if (saveState.saving || runLock.busy) return;
    const snapshot = { name: nameRef.current, graph: graphRef.current };
    setSaving(true); setSaveError(null);
    try {
      validateGraph(snapshot.graph);
      await saveState.save(async version => {
        const res = await fetch(`/api/canvas/${workflowId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...snapshot, version }),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error?.message || `儲存失敗（${res.status}），草稿仍保留`);
        if (result.workflow?.id !== workflowId) throw new Error("儲存回應與畫布不符，請保留草稿");
        return { version: result.workflow.version };
      });
    } catch (e) { setSaveError(e instanceof Error ? e.message : "儲存失敗，草稿仍保留"); }
    finally { setSaving(false); setDirty(saveState.dirty); }
  };
  const exportDraft = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ name: nameRef.current, graph: graphRef.current, version: saveState.version }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `canvas-${workflowId}-draft.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /* ---- node ops ---- */
  const addNode = (type: CanvasNodeType, at?: { x: number; y: number }) => {
    const pos = at ?? { x: (200 - panRef.current.x) / zoomRef.current, y: (120 - panRef.current.y) / zoomRef.current };
    const node: CanvasNode = { id: newId("node"), type, x: pos.x, y: pos.y, data: defaultNodeData(type), status: "idle" };
    mutate((g) => ({ ...g, nodes: [...g.nodes, node] }));
    setAddMenuOpen(false);
    if (type === "loadImage") ensureAssets();
  };

  const updateNodeData = (id: string, patch: Record<string, unknown>) => {
    mutate((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) }));
  };

  const execute = async (nodeId?: string) => {
    if (saveState.saving) return;
    await runLock.run(async () => {
      setRunningAll(true); setSaveError(null);
      const controller = new AbortController(); runController.current = controller;
      try {
        const snapshot = structuredClone(validateGraph(graphRef.current));
        const order = nodeId ? upstreamOrder(snapshot, nodeId) : topoOrder(snapshot);
        if (!order || (nodeId && !order.length)) throw new Error("圖裡有循環連接，請先移除循環連線");
        const currentRatesResponse = await fetch("/api/rates", { cache: "no-store" });
        if (!currentRatesResponse.ok) throw new Error("無法取得點數費率，請稍後再試");
        const currentRates = (await currentRatesResponse.json()).rates ?? [];
        setRates(currentRates);
        if (canvasRunCredits(snapshot, currentRates, order) === null) throw new Error("部分模型尚未設定有效點數費率或解析度，請更換設定後再執行");
        await executeGraph(snapshot, order, (id, patch) => {
          if (!controller.signal.aborted) commitGraph({ ...graphRef.current, nodes: graphRef.current.nodes.map(n => n.id === id ? { ...n, ...patch } : n) });
        }, controller.signal);
      } catch (e) { if (!controller.signal.aborted) setSaveError(e instanceof Error ? e.message : "執行失敗"); }
      finally { if (!controller.signal.aborted) setRunningAll(false); runController.current = null; }
    });
  };
  const runOne = (id: string) => execute(id);
  const runAll = () => execute();

  const totalCredits = canvasRunCredits(graph, rates);
  const selectedCredits = selectedNode ? canvasRunCredits(graph, rates, upstreamOrder(graph, selectedNode)) : null;
  const directorNode = graph.nodes.find(n => n.id === director3dNodeId);
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  return (
    <div className="flex h-full flex-col bg-[#0a0a0a]">
      {/* toolbar */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[#1c1c1c] bg-black px-4">
        <Link href="/canvas" className="rounded-lg p-1.5 text-[#9a9a9a] transition-colors hover:text-white" aria-label="返回">
          <IconChevronLeft className="h-4 w-4" />
        </Link>
        <input
          value={name}
          maxLength={120}
          disabled={runningAll}
          onChange={(e) => {
            nameRef.current = e.target.value; setName(e.target.value);
            saveState.edit(); setDirty(saveState.dirty);
          }}
          className="w-[220px] rounded-lg bg-transparent px-2 py-1 text-[14px] font-medium text-white focus:bg-[#161616] focus:outline-none"
        />
        <span className="text-[11.5px] text-[#6d6d6d]">{runningAll ? "執行中，請勿關閉" : saving ? "儲存中…" : dirty ? "尚未儲存" : "已儲存"}</span>

        <div className="relative ml-4">
          <button
            type="button"
            disabled={runningAll}
            onClick={() => setAddMenuOpen((v) => !v)}
            className="flex h-8 items-center gap-1.5 rounded-full bg-[#1f1f1f] px-3 text-[12.5px] text-white transition-colors hover:bg-[#282828]"
          >
            <IconPlus className="h-3.5 w-3.5" />
            新增節點
          </button>
          {addMenuOpen && (
            <div className="bw-menu absolute left-0 top-[calc(100%+6px)] z-40 w-[200px] p-1.5">
              {NODE_TYPES.map((t) => {
                const Icon = NODE_ICON[t];
                return (
                  <button key={t} type="button" className="bw-menu-item" onClick={() => addNode(t)}>
                    <Icon className="h-[15px] w-[15px]" />
                    <span className="flex-1 text-left">
                      <span className="block">{NODE_SPECS[t].label}</span>
                      <span className="block text-[10.5px] text-[#7d7d7d]">{NODE_SPECS[t].hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={exportDraft} className="whitespace-nowrap text-xs text-[#7ff0cd]">匯出草稿</button>
          <button
            type="button"
            onClick={runAll}
            disabled={runningAll || saving || graph.nodes.length === 0}
            className="flex h-8 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-4 text-[12.5px] font-medium text-[#0a1a16] transition-[filter] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <IconPlay className="h-3.5 w-3.5" />
            {runningAll ? "執行中…" : "全部執行"}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || runningAll}
            className="h-8 rounded-full border border-[#3a3a3a] px-4 text-[12.5px] text-white transition-colors hover:border-[#555] disabled:opacity-50"
          >
            儲存
          </button>
        </div>
      </div>

      <div className="shrink-0 border-b border-[#252525] bg-[#101817] px-4 py-2 text-xs text-[#9ce9d5]">
        <button type="button" onClick={() => setCostDetails(v => !v)} aria-expanded={costDetails} className="text-left">
          全部執行：約 {totalCredits === null ? "費率未設定" : `${totalCredits} 點`}　{selectedNode && `選取節點含上游：約 ${selectedCredits === null ? "費率未設定" : `${selectedCredits} 點`}　`}{costDetails ? "收合明細 ▴" : "查看點數明細 ▾"}
        </button>
        {costDetails && <div className="mt-2 max-h-36 overflow-auto text-[#b1bfbb]">
          {graph.nodes.map((n, index) => <div key={n.id} className="flex flex-wrap justify-between gap-2 py-1"><span>{index + 1}. {NODE_SPECS[n.type].label} {n.data.model ? modelLabel(String(n.data.model)) : ""}</span><span>{canvasNodeCredits(n, rates) === null ? "費率未設定" : `${canvasNodeCredits(n, rates)} 點`}</span></div>)}
          <p className="pt-2 text-[#849a93]">依站內費率估算；圖片以每節點 1 張計算，影片依時長及解析度計算。單點執行包含上游節點；每次重跑重新計費，實際扣點以執行紀錄為準。</p>
        </div>}
      </div>

      {saveError && <p role="alert" className="shrink-0 bg-[#301919] px-4 py-2 text-sm text-red-200">{saveError}</p>}
      {/* canvas */}
      <div
        ref={containerRef}
        inert={runningAll}
        className="relative flex-1 select-none overflow-hidden"
        style={{
          backgroundImage: "radial-gradient(circle, #1e1e1e 1px, transparent 1px)",
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return;
          setSelectedNode(null);
          setSelectedEdge(null);
          setInteraction({ kind: "pan", startClientX: e.clientX, startClientY: e.clientY, startPan: pan });
        }}
      >
        <div
          className="absolute left-0 top-0"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
        >
          <svg style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, overflow: "visible", pointerEvents: "none" }}>
            {graph.edges.map((edge) => {
              const from = nodeById.get(edge.fromNode);
              const to = nodeById.get(edge.toNode);
              if (!from || !to) return null;
              const a = outputPos(from);
              const b = inputPos(to, edge.toPort);
              const spec = NODE_SPECS[from.type];
              const color = PORT_COLOR[spec.output.type];
              return (
                <path
                  key={edge.id}
                  d={bezier(a, b)}
                  fill="none"
                  stroke={selectedEdge === edge.id ? "#ff6b6b" : color}
                  strokeWidth={selectedEdge === edge.id ? 2.5 : 1.8}
                  style={{ pointerEvents: "stroke", cursor: "pointer" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedEdge(edge.id);
                    setSelectedNode(null);
                  }}
                />
              );
            })}
            {interaction?.kind === "connect" && (() => {
              const from = nodeById.get(interaction.fromNode);
              if (!from) return null;
              return (
                <path
                  d={bezier(outputPos(from), { x: interaction.x, y: interaction.y })}
                  fill="none"
                  stroke={PORT_COLOR[interaction.portType]}
                  strokeWidth={1.8}
                  strokeDasharray="4 3"
                />
              );
            })()}
          </svg>

          {graph.nodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              selected={selectedNode === node.id}
              assetLibrary={assetLibrary}
              videoModels={videoModels}
              onEnsureAssets={ensureAssets}
              onSelect={() => {
                setSelectedNode(node.id);
                setSelectedEdge(null);
              }}
              onHeaderPointerDown={(e) => {
                e.stopPropagation();
                setSelectedNode(node.id);
                setSelectedEdge(null);
                const w = toWorld(e.clientX, e.clientY);
                setInteraction({ kind: "dragNode", id: node.id, offsetX: w.x - node.x, offsetY: w.y - node.y });
              }}
              onDelete={() => {
                mutate((g) => ({
                  nodes: g.nodes.filter((n) => n.id !== node.id),
                  edges: g.edges.filter((ed) => ed.fromNode !== node.id && ed.toNode !== node.id),
                }));
              }}
              onRun={() => runOne(node.id)}
              onDataChange={(patch) => updateNodeData(node.id, patch)}
              onOpenDirector3D={() => setDirector3dNodeId(node.id)}
              onResizePointerDown={(e) => {
                e.stopPropagation();
                setSelectedNode(node.id);
                setSelectedEdge(null);
                setInteraction({
                  kind: "resizeNode",
                  id: node.id,
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  startWidth: node.width ?? NODE_WIDTH,
                  startHeight: node.textHeight ?? DEFAULT_TEXT_HEIGHT,
                });
              }}
              onOutputPortDown={(e) => {
                e.stopPropagation();
                const w = toWorld(e.clientX, e.clientY);
                setInteraction({ kind: "connect", fromNode: node.id, fromPort: NODE_SPECS[node.type].output.id, portType: NODE_SPECS[node.type].output.type, x: w.x, y: w.y });
              }}
            />
          ))}
        </div>

        {graph.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center text-[13px] text-[#4a4a4a]">
            <div>
              畫布是空的
              <br />
              點左上角「新增節點」開始搭建工作流
            </div>
          </div>
        )}
      </div>

      {directorNode && <Director3DPanel
        initial={directorNode.data as unknown as Director3DSceneData}
        onSave={data => updateNodeData(directorNode.id, data as unknown as Record<string, unknown>)}
        onClose={() => setDirector3dNodeId(null)}
      />}
    </div>
  );
}

function NodeCard({
  node,
  selected,
  assetLibrary,
  videoModels,
  onEnsureAssets,
  onSelect,
  onHeaderPointerDown,
  onDelete,
  onRun,
  onDataChange,
  onOutputPortDown,
  onOpenDirector3D,
  onResizePointerDown,
}: {
  node: CanvasNode;
  selected: boolean;
  assetLibrary: AssetLite[] | null;
  videoModels: { id: string; name: string }[];
  onEnsureAssets: () => void;
  onSelect: () => void;
  onHeaderPointerDown: (e: React.PointerEvent) => void;
  onDelete: () => void;
  onRun: () => void;
  onDataChange: (patch: Record<string, unknown>) => void;
  onOutputPortDown: (e: React.PointerEvent) => void;
  onOpenDirector3D: () => void;
  onResizePointerDown: (e: React.PointerEvent) => void;
}) {
  const spec = NODE_SPECS[node.type];
  const Icon = NODE_ICON[node.type];
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  // Screen position for the portaled asset picker below — see its own
  // comment for why this can't just be a plain CSS-relative dropdown.
  const [assetPickerPos, setAssetPickerPos] = useState<{ top: number; left: number } | null>(null);

  const fieldCls =
    "w-full rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-2.5 py-1.5 text-[12px] text-white focus:border-[#4a4a4a] focus:outline-none";

  return (
    <div
      onPointerDown={onSelect}
      className={[
        "absolute overflow-visible rounded-xl border bg-[#161616] shadow-lg",
        selected ? "border-[#7ff0cd]" : "border-[#2a2a2a]",
      ].join(" ")}
      style={{ left: node.x, top: node.y, width: node.width ?? NODE_WIDTH }}
    >
      {/* header */}
      <div
        onPointerDown={onHeaderPointerDown}
        className="flex h-10 cursor-grab items-center gap-1.5 rounded-t-xl border-b border-[#232323] px-2.5 active:cursor-grabbing"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-[#9a9a9a]" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-white">{String(node.data.title || spec.label)}</span>
        <StatusDot status={node.status} />
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRun}
          title="執行（會先跑上游節點）"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[#9a9a9a] transition-colors hover:bg-[#242424] hover:text-[#7ff0cd]"
        >
          <IconPlay className="h-3 w-3" />
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onDelete}
          title="刪除節點"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[#9a9a9a] transition-colors hover:bg-[#2a1616] hover:text-[#ff8a8a]"
        >
          <IconTrash className="h-3 w-3" />
        </button>

        {/* output port */}
        <div
          data-port-kind="out"
          onPointerDown={onOutputPortDown}
          title={spec.output.label}
          className="absolute -right-[7px] top-1/2 h-3 w-3 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-[#161616]"
          style={{ background: PORT_COLOR[spec.output.type] }}
        />
      </div>

      {/* input port rows */}
      {spec.inputs.map((inp) => (
        <div key={inp.id} className="relative flex items-center px-2.5 text-[11px] text-[#8a8a8a]" style={{ height: NODE_PORT_ROW_H }}>
          <div
            data-port-kind="in"
            data-node-id={node.id}
            data-port-id={inp.id}
            data-port-type={inp.type}
            className="absolute -left-[7px] h-3 w-3 rounded-full border-2 border-[#161616]"
            style={{ background: PORT_COLOR[inp.type] }}
          />
          <span className="ml-1.5">{inp.label}</span>
        </div>
      ))}

      {/* body */}
      <div className="space-y-2 p-2.5 pt-1.5" onPointerDown={(e) => e.stopPropagation()}>
        {node.type === "text" && (
          <textarea
            value={String(node.data.text ?? "")}
            onChange={(e) => onDataChange({ text: e.target.value })}
            placeholder="輸入文字…"
            className={fieldCls + " resize-none"}
            style={{ minHeight: MIN_TEXT_HEIGHT, maxHeight: node.textHeight ?? DEFAULT_TEXT_HEIGHT, overflowY: "auto" }}
          />
        )}

        {node.type === "loadImage" && (() => {
          const items = (node.data.items as { assetId: number; src: string; name: string }[] | undefined) ?? [];
          const selectedIds = new Set(items.map((it) => it.assetId));
          const toggle = (a: AssetLite) => {
            const on = selectedIds.has(a.id);
            const next = on ? items.filter((it) => it.assetId !== a.id) : [...items, { assetId: a.id, src: a.src, name: a.name }];
            onDataChange({ items: next, officialCharacter: "" });
          };
          return (
            <div className="relative">
              <label className="mb-2 block text-xs text-neutral-400">官方角色三視圖<select aria-label="官方角色三視圖" className="mt-1 w-full rounded bg-neutral-800 p-2 text-white" value={String(node.data.officialCharacter || "")} onChange={e => onDataChange({ officialCharacter: e.target.value, items: [] })}><option value="">使用自己的素材</option>{OFFICIAL_CHARACTERS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              {officialCharacter(node.data.officialCharacter) && <Image width={3840} height={2160} alt="角色三視圖參考" src={officialCharacter(node.data.officialCharacter)!.src} className="mb-2 w-full rounded bg-white" />}
              {items.length > 0 && (
                <div className="grid grid-cols-4 gap-1">
                  {items.map((it) => (
                    <div key={it.assetId} className="group/thumb relative aspect-square overflow-hidden rounded-md border border-[#2c2c2c]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.src} alt={it.name} title={it.name} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => onDataChange({ items: items.filter((x) => x.assetId !== it.assetId) })}
                        aria-label="移除"
                        className="absolute right-0.5 top-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-black/70 text-[9px] text-white opacity-0 group-hover/thumb:opacity-100"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={(e) => {
                  onEnsureAssets();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setAssetPickerPos({ top: rect.bottom + 4, left: rect.left });
                  setAssetPickerOpen((v) => !v);
                }}
                className={[
                  "flex w-full items-center justify-center rounded-lg border border-dashed border-[#3a3a3a] text-[11.5px] text-[#8a8a8a] hover:border-[#555]",
                  items.length > 0 ? "mt-1.5 h-8" : "h-16",
                ].join(" ")}
              >
                {items.length > 0 ? `再選一張（已選 ${items.length} 張）` : "選擇素材（可選多張）"}
              </button>

              {/*
               * Portaled to document.body at a fixed screen position, not a
               * plain CSS-relative dropdown — this node card lives inside
               * 智慧畫布's pannable/zoomable canvas viewport, which is
               * overflow-hidden (so nodes don't visually leak out during
               * pan/zoom). A real bug found in a 2026-09-07 UI audit: any
               * node not near the very top-left of the visible canvas would
               * have this picker partly or entirely clipped by that
               * ancestor — the exact same class of bug already fixed today
               * for the sidebar's model flyout and 進階設定. Trade-off: the
               * picker won't follow the node if you pan while it's open
               * (rare — you're about to click inside it) — far better than
               * being unreachable.
               */}
              {assetPickerOpen && assetPickerPos && createPortal(
                <div
                  className="bw-menu fixed z-50 w-[260px] p-2"
                  style={{ top: assetPickerPos.top, left: assetPickerPos.left }}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] text-white">選擇素材（可複選）</span>
                    <button type="button" onClick={() => setAssetPickerOpen(false)} className="text-[10.5px] text-[#8a8a8a] hover:text-white">
                      完成
                    </button>
                  </div>
                  <div className="grid max-h-[200px] grid-cols-4 gap-1.5 overflow-y-auto">
                    {assetLibrary === null && <span className="col-span-4 py-3 text-center text-[11px] text-[#6d6d6d]">載入中…</span>}
                    {assetLibrary?.length === 0 && <span className="col-span-4 py-3 text-center text-[11px] text-[#6d6d6d]">資產庫還沒有圖片</span>}
                    {assetLibrary?.map((a) => {
                      const on = selectedIds.has(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          title={a.name}
                          onClick={() => toggle(a)}
                          className={`relative aspect-square overflow-hidden rounded-md border ${on ? "border-[#7ff0cd]" : "border-[#2a2a2a] hover:border-[#4a4a4a]"}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.src} alt={a.name} className="h-full w-full object-cover" />
                          {on && <span className="absolute inset-0 grid place-items-center bg-black/40 text-[11px] text-[#7ff0cd]">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>,
                document.body
              )}
            </div>
          );
        })()}

        {node.type === "image" && (() => {
          // Per this model's own real size options (lib/imageModels.ts's
          // sizeOptionsFor) — not one flat list every model shared before
          // the 2026-09-07 audit, which offered sizes some models reject
          // (Seedream 4.5/5.0 need ≥3,686,400px; GPT Image 2's real sizes
          // aren't Seedream's) and even one or two the server itself didn't
          // accept from any model. Falls back to this model's first valid
          // size if a saved/previous choice no longer applies.
          const imageSizes = sizeOptionsFor(String(node.data.model ?? ""));
          const currentSize = String(node.data.size ?? "");
          const selectedSize = imageSizes.includes(currentSize) ? currentSize : imageSizes[0];
          return (
          <>
            <select value={String(node.data.model ?? "")} onChange={(e) => onDataChange({ model: e.target.value, size: sizeOptionsFor(e.target.value)[0] })} className={fieldCls}>
              {/nsfw/i.test(String(node.data.model ?? "")) && <option value={String(node.data.model)} disabled>請重新選擇模型</option>}
              {IMAGE_MODELS.filter((m) => !/nsfw/i.test(m.id)).map((m) => (
                <option key={m.id} value={m.id}>
                  {modelLabel(m.name)}
                </option>
              ))}
            </select>
            <select value={selectedSize} onChange={(e) => onDataChange({ size: e.target.value })} className={fieldCls}>
              {imageSizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <textarea
              value={String(node.data.prompt ?? "")}
              onChange={(e) => onDataChange({ prompt: e.target.value })}
              placeholder="沒接文字節點時用這裡的 prompt"
              rows={2}
              className={fieldCls + " resize-none"}
            />
          </>
          );
        })()}

        {node.type === "video" && (() => {
          // Same per-model reasoning as the image node above, via
          // lib/videoModels.ts's videoConstraintFor — 2.0-mini/2.0-fast
          // don't reach 1080p, base 2.0 alone has a real 4k tier, and only
          // 2.5 reaches the full 30s (the exact bug this audit started
          // from: a real user hit an upstream rejection because the
          // resolution list here didn't know that).
          const videoModelId = String(node.data.model ?? "");
          const constraint = videoConstraintFor(videoModelId);
          const currentSeconds = Number(node.data.seconds) || 5;
          return (
          <>
            <select value={String(node.data.model ?? "")} onChange={(e) => onDataChange({ model: e.target.value, resolution: normalizeVideoResolution(e.target.value, String(node.data.resolution ?? "480p")) })} className={fieldCls}>
              {/nsfw/i.test(String(node.data.model ?? "")) && <option value={String(node.data.model)} disabled>請重新選擇模型</option>}
              {videoModels.length === 0 && <option value="">載入中…</option>}
              {videoModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {modelLabel(m.name)}
                </option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <input
                type="number"
                min={1}
                max={constraint.maxSeconds}
                value={Math.min(currentSeconds, constraint.maxSeconds)}
                onChange={(e) => onDataChange({ seconds: Number(e.target.value) })}
                className={fieldCls + " w-1/2"}
              />
              <select value={videoResolutionsForModel(String(node.data.model ?? "")).includes(String(node.data.resolution ?? "480p") as never) ? String(node.data.resolution ?? "480p") : ""} onChange={(e) => onDataChange({ resolution: e.target.value })} className={fieldCls + " w-1/2"}>
                <option value="" disabled>請選擇支援的解析度</option>
                {videoResolutionsForModel(String(node.data.model ?? "")).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={String(node.data.prompt ?? "")}
              onChange={(e) => onDataChange({ prompt: e.target.value })}
              placeholder="沒接文字節點時用這裡的 prompt"
              rows={2}
              className={fieldCls + " resize-none"}
            />
          </>
          );
        })()}

        {node.type === "director3d" && (
          <>
            {node.data.capturedImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={String(node.data.capturedImage)} alt="3D 截圖" className="w-full rounded-lg border border-[#2c2c2c]" />
            ) : (
              <div className="grid h-20 place-items-center rounded-lg border border-dashed border-[#3a3a3a] text-[11px] text-[#6d6d6d]">
                還沒截圖
              </div>
            )}
            <button
              type="button"
              onClick={onOpenDirector3D}
              className="w-full rounded-lg border border-[#3a3a3a] bg-[#1c1c1c] py-1.5 text-[11.5px] text-[#c9c9c9] hover:border-[#555]"
            >
              開啟 3D 導演台
            </button>
          </>
        )}

        {/* output preview — loadImage/director3d render their own thumbnails above instead */}
        {node.output?.kind === "image" && node.type !== "loadImage" && node.type !== "director3d" && (
          <div className={node.output.items.length > 1 ? "grid grid-cols-2 gap-1" : undefined}>
            {node.output.items.map((it, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={it.url} alt="" className="w-full rounded-lg border border-[#2c2c2c]" />
            ))}
          </div>
        )}
        {node.output?.kind === "video" && (
          <video src={node.output.url} controls disablePictureInPicture disableRemotePlayback className="w-full rounded-lg border border-[#2c2c2c]" />
        )}
        {node.output?.kind === "text" && node.type !== "text" && (
          <div
            className="overflow-y-auto rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] p-2 text-[11px] text-[#c9c9c9]"
            style={{ maxHeight: node.textHeight ?? DEFAULT_TEXT_HEIGHT }}
          >
            {node.output.text}
          </div>
        )}
        {node.error && <div className="rounded-lg border border-[#4a2020] bg-[#1a1010] p-2 text-[11px] text-[#ff9b9b]">{node.error}</div>}
      </div>

      {/* resize handle — drags width + the text area's height together, see the "resizeNode" interaction in CanvasEditor */}
      <div
        onPointerDown={onResizePointerDown}
        title="拖曳調整節點大小"
        className="absolute -bottom-1 -right-1 h-4 w-4 cursor-nwse-resize rounded-tl-md text-[#5c5c5c] hover:text-[#7ff0cd]"
      >
        <svg viewBox="0 0 16 16" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M13 3 L3 13 M13 8 L8 13 M13 13 L13 13" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status?: CanvasNode["status"] }) {
  if (!status || status === "idle") return null;
  if (status === "running") return <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#f0d27f]" />;
  if (status === "done") return <span className="h-2 w-2 shrink-0 rounded-full bg-[#7ff0cd]" />;
  return <span className="h-2 w-2 shrink-0 rounded-full bg-[#ff6b6b]" />;
}
