"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { IconChevronLeft, IconPlus, IconPlay, IconTrash, IconImage, IconVideo, IconChat, IconAssets } from "../Icons";
import {
  NODE_SPECS,
  NODE_TYPES,
  NODE_WIDTH,
  NODE_HEADER_H,
  NODE_PORT_ROW_H,
  defaultNodeData,
  newId,
  type CanvasGraph,
  type CanvasNode,
  type CanvasNodeType,
  type PortType,
} from "@/lib/canvas/types";
import { topoOrder, upstreamOrder, inputsFor, runNode } from "@/lib/canvas/engine";
import { IMAGE_MODELS } from "@/lib/imageModels";
import { IMAGE_SIZES, RESOLUTIONS } from "@/lib/types";

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
  | null;

function outputPos(n: CanvasNode) {
  return { x: n.x + NODE_WIDTH, y: n.y + NODE_HEADER_H / 2 };
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
}: {
  workflowId: string;
  initialName: string;
  initialGraph: CanvasGraph;
}) {
  const [name, setName] = useState(initialName);
  const [graph, setGraph] = useState<CanvasGraph>(initialGraph);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 80, y: 60 });
  const [zoom, setZoom] = useState(1);
  const [interaction, setInteraction] = useState<Interaction>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [assetLibrary, setAssetLibrary] = useState<AssetLite[] | null>(null);
  const [videoModelIds, setVideoModelIds] = useState<string[]>([]);

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
  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  const mutate = (fn: (g: CanvasGraph) => CanvasGraph) => {
    setGraph((g) => fn(g));
    setDirty(true);
  };

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
      .then((j: { models: { id: string; modality: string }[] }) =>
        setVideoModelIds(j.models.filter((m) => m.modality === "video").map((m) => m.id))
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
  }, [interaction, toWorld]);

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
  }, [selectedNode, selectedEdge]);

  /* ---- save ---- */
  const save = useCallback(async () => {
    setSaving(true);
    try {
      await fetch(`/api/canvas/${workflowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, graph: graphRef.current }),
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [workflowId, name]);

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

  const setNodeRunState = (id: string, patch: Partial<CanvasNode>) => {
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  };

  const runOne = async (nodeId: string) => {
    const order = upstreamOrder(graphRef.current, nodeId);
    if (!order.length) {
      setNodeRunState(nodeId, { status: "error", error: "圖裡有循環連接，無法執行" });
      return;
    }
    for (const id of order) {
      const node = graphRef.current.nodes.find((n) => n.id === id);
      if (!node) continue;
      setNodeRunState(id, { status: "running", error: null });
      try {
        const inputs = inputsFor(graphRef.current, id);
        const output = await runNode(node, inputs);
        setNodeRunState(id, { status: "done", output, error: null });
        graphRef.current = { ...graphRef.current, nodes: graphRef.current.nodes.map((n) => (n.id === id ? { ...n, status: "done", output } : n)) };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "執行失敗";
        setNodeRunState(id, { status: "error", error: msg });
        return;
      }
    }
  };

  const runAll = async () => {
    const order = topoOrder(graphRef.current);
    if (!order) {
      alert("圖裡有循環連接（節點互相依賴），請先移除造成循環的連線");
      return;
    }
    setRunningAll(true);
    for (const id of order) {
      const node = graphRef.current.nodes.find((n) => n.id === id);
      if (!node) continue;
      setNodeRunState(id, { status: "running", error: null });
      try {
        const inputs = inputsFor(graphRef.current, id);
        const output = await runNode(node, inputs);
        setNodeRunState(id, { status: "done", output, error: null });
        graphRef.current = { ...graphRef.current, nodes: graphRef.current.nodes.map((n) => (n.id === id ? { ...n, status: "done", output } : n)) };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "執行失敗";
        setNodeRunState(id, { status: "error", error: msg });
        setRunningAll(false);
        return;
      }
    }
    setRunningAll(false);
  };

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
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          className="w-[220px] rounded-lg bg-transparent px-2 py-1 text-[14px] font-medium text-white focus:bg-[#161616] focus:outline-none"
        />
        <span className="text-[11.5px] text-[#6d6d6d]">{saving ? "儲存中…" : dirty ? "尚未儲存" : "已儲存"}</span>

        <div className="relative ml-4">
          <button
            type="button"
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
          <button
            type="button"
            onClick={runAll}
            disabled={runningAll || graph.nodes.length === 0}
            className="flex h-8 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-4 text-[12.5px] font-medium text-[#0a1a16] transition-[filter] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <IconPlay className="h-3.5 w-3.5" />
            {runningAll ? "執行中…" : "全部執行"}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-8 rounded-full border border-[#3a3a3a] px-4 text-[12.5px] text-white transition-colors hover:border-[#555] disabled:opacity-50"
          >
            儲存
          </button>
        </div>
      </div>

      {/* canvas */}
      <div
        ref={containerRef}
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
              videoModelIds={videoModelIds}
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
    </div>
  );
}

function NodeCard({
  node,
  selected,
  assetLibrary,
  videoModelIds,
  onEnsureAssets,
  onSelect,
  onHeaderPointerDown,
  onDelete,
  onRun,
  onDataChange,
  onOutputPortDown,
}: {
  node: CanvasNode;
  selected: boolean;
  assetLibrary: AssetLite[] | null;
  videoModelIds: string[];
  onEnsureAssets: () => void;
  onSelect: () => void;
  onHeaderPointerDown: (e: React.PointerEvent) => void;
  onDelete: () => void;
  onRun: () => void;
  onDataChange: (patch: Record<string, unknown>) => void;
  onOutputPortDown: (e: React.PointerEvent) => void;
}) {
  const spec = NODE_SPECS[node.type];
  const Icon = NODE_ICON[node.type];
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);

  const fieldCls =
    "w-full rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-2.5 py-1.5 text-[12px] text-white focus:border-[#4a4a4a] focus:outline-none";

  return (
    <div
      onPointerDown={onSelect}
      className={[
        "absolute overflow-visible rounded-xl border bg-[#161616] shadow-lg",
        selected ? "border-[#7ff0cd]" : "border-[#2a2a2a]",
      ].join(" ")}
      style={{ left: node.x, top: node.y, width: NODE_WIDTH }}
    >
      {/* header */}
      <div
        onPointerDown={onHeaderPointerDown}
        className="flex h-10 cursor-grab items-center gap-1.5 rounded-t-xl border-b border-[#232323] px-2.5 active:cursor-grabbing"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-[#9a9a9a]" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-white">{spec.label}</span>
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
            rows={3}
            className={fieldCls + " resize-none"}
          />
        )}

        {node.type === "loadImage" && (
          <div className="relative">
            {node.data.src ? (
              <button
                type="button"
                onClick={() => {
                  onEnsureAssets();
                  setAssetPickerOpen((v) => !v);
                }}
                className="block w-full overflow-hidden rounded-lg border border-[#2c2c2c]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={String(node.data.src)} alt="" className="h-24 w-full object-cover" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onEnsureAssets();
                  setAssetPickerOpen((v) => !v);
                }}
                className="flex h-16 w-full items-center justify-center rounded-lg border border-dashed border-[#3a3a3a] text-[11.5px] text-[#8a8a8a] hover:border-[#555]"
              >
                選擇素材
              </button>
            )}
            {node.data.name ? <div className="mt-1 truncate text-[10.5px] text-[#7d7d7d]">{String(node.data.name)}</div> : null}

            {assetPickerOpen && (
              <div className="bw-menu absolute left-0 top-[calc(100%+4px)] z-50 w-[260px] p-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] text-white">選擇素材</span>
                  <button type="button" onClick={() => setAssetPickerOpen(false)} className="text-[10.5px] text-[#8a8a8a] hover:text-white">
                    關閉
                  </button>
                </div>
                <div className="grid max-h-[200px] grid-cols-4 gap-1.5 overflow-y-auto">
                  {assetLibrary === null && <span className="col-span-4 py-3 text-center text-[11px] text-[#6d6d6d]">載入中…</span>}
                  {assetLibrary?.length === 0 && <span className="col-span-4 py-3 text-center text-[11px] text-[#6d6d6d]">資產庫還沒有圖片</span>}
                  {assetLibrary?.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      title={a.name}
                      onClick={() => {
                        onDataChange({ assetId: a.id, src: a.src, name: a.name });
                        setAssetPickerOpen(false);
                      }}
                      className="aspect-square overflow-hidden rounded-md border border-[#2a2a2a] hover:border-[#4a4a4a]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.src} alt={a.name} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {node.type === "image" && (
          <>
            <select value={String(node.data.model ?? "")} onChange={(e) => onDataChange({ model: e.target.value })} className={fieldCls}>
              {IMAGE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select value={String(node.data.size ?? "1024x1024")} onChange={(e) => onDataChange({ size: e.target.value })} className={fieldCls}>
              {IMAGE_SIZES.map((s) => (
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
        )}

        {node.type === "video" && (
          <>
            <select value={String(node.data.model ?? "")} onChange={(e) => onDataChange({ model: e.target.value })} className={fieldCls}>
              {videoModelIds.length === 0 && <option value={String(node.data.model ?? "")}>{String(node.data.model ?? "載入中…")}</option>}
              {videoModelIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <input
                type="number"
                min={1}
                max={20}
                value={Number(node.data.seconds ?? 5)}
                onChange={(e) => onDataChange({ seconds: Number(e.target.value) })}
                className={fieldCls + " w-1/2"}
              />
              <select value={String(node.data.resolution ?? "480p")} onChange={(e) => onDataChange({ resolution: e.target.value })} className={fieldCls + " w-1/2"}>
                {RESOLUTIONS.map((r) => (
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
        )}

        {/* output preview */}
        {node.output?.kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={node.output.url} alt="" className="w-full rounded-lg border border-[#2c2c2c]" />
        )}
        {node.output?.kind === "video" && (
          <video src={node.output.url} controls className="w-full rounded-lg border border-[#2c2c2c]" />
        )}
        {node.output?.kind === "text" && node.type !== "text" && (
          <div className="rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] p-2 text-[11px] text-[#c9c9c9]">{node.output.text}</div>
        )}
        {node.error && <div className="rounded-lg border border-[#4a2020] bg-[#1a1010] p-2 text-[11px] text-[#ff9b9b]">{node.error}</div>}
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
