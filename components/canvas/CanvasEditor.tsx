"use client";
import Image from "next/image";
import DirectorBoard from "./DirectorBoard";
import { invalidateChanged, orderedShots, plannedShotRun, storyParagraphs } from "@/lib/canvas/storyboard";
import { OFFICIAL_CHARACTERS, officialCharacter } from "@/lib/canvas/officialCharacters";

import { modelLabel } from "@/lib/modelLabel";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { IconChevronLeft, IconPlus, IconPlay, IconTrash, IconImage, IconVideo, IconChat, IconAssets, IconAvatar } from "../Icons";
import Director3DPanel from "./director3d/Director3DPanel";
import type { Director3DSceneData } from "@/lib/canvas/director3d";
import {
  NODE_SPECS,
  NODE_TYPES,
  NODE_WIDTH,
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
} from "@/lib/canvas/types";
import { topoOrder, upstreamOrder, executeGraph } from "@/lib/canvas/engine";
import { CanvasSaveState, CanvasRunLock } from "@/lib/canvas/saveState";
import { validateGraph } from "@/lib/canvas/validation";
import { canvasNodeCredits, canvasRunCredits } from "@/lib/canvas/cost";
import type { RateCardEntry } from "@/lib/pricing";
import { IMAGE_MODELS, sizeOptionsFor } from "@/lib/imageModels";
import { isNewModel } from "@/lib/modelNew";
import { videoResolutionsForModel, normalizeVideoResolution, videoConstraintFor } from "@/lib/videoModels";
import { useLocale, useTr } from "@/lib/i18n/client";
import { canvasConnectionsCopy } from "@/lib/i18n/canvasConnections";
import { canvasPortKey, connectCanvasPorts, connectionRejection, type ConnectionSource, type ConnectionTarget } from "@/lib/canvas/connections";
import type { CanvasEditorRuntime } from "@/lib/canvas/runtime";
import CanvasConnections, { CONNECTION_COLORS, type ConnectionSession, type PortOffsets } from "./CanvasConnections";
import CanvasRunConfirmation from "./CanvasRunConfirmation";
import connectionStyles from "./connections.module.css";
import workspaceStyles from "./workspace.module.css";
import { canvasWorkspaceCopy } from "@/lib/i18n/canvasWorkspace";

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
  | { kind: "pan"; startClientX: number; startClientY: number; startPan: { x: number; y: number }; pointerId: number }
  | { kind: "dragNode"; id: string; offsetX: number; offsetY: number; pointerId: number }
  | { kind: "resizeNode"; id: string; startClientX: number; startClientY: number; startWidth: number; startHeight: number; pointerId: number }
  | null;

export default function CanvasEditor({
  workflowId,
  initialName,
  initialGraph,
  initialVersion,
  runtime,
}: {
  workflowId: string;
  initialName: string;
  initialGraph: CanvasGraph;
  initialVersion: string;
  runtime?: CanvasEditorRuntime;
}) {
  const tr = useTr();
  const locale = useLocale();
  const connectionCopy = canvasConnectionsCopy[locale];
  const workspaceCopy = canvasWorkspaceCopy[locale];
  const [rates, setRates] = useState<RateCardEntry[]>([]);
  const [view, setView] = useState<"canvas" | "director">(runtime?.initialView ?? (runtime ? "canvas" : "director"));
  const [costDetails, setCostDetails] = useState(false);
  useEffect(() => {
    if (runtime) return;
    let alive = true;
    const refresh = () => fetch("/api/rates", { cache: "no-store" }).then(r => r.ok ? r.json() : { rates: [] }).then(j => { if (alive) setRates(j.rates ?? []); }).catch(() => { if (alive) setRates([]); });
    void refresh();
    window.addEventListener("focus", refresh);
    return () => { alive = false; window.removeEventListener("focus", refresh); };
  }, [runtime]);
  const [name, setName] = useState(initialName);
  const [graph, setGraph] = useState<CanvasGraph>(() => ({ ...initialGraph, nodes: initialGraph.nodes.map(n => n.status === "running" ? { ...n, status: "error", output: null, error: tr("上次執行已中斷，請確認生成紀錄後再執行") } : n) }));
  const [dirty, setDirty] = useState(initialGraph.nodes.some(n => n.status === "running"));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState] = useState(() => { const state = new CanvasSaveState(initialVersion); if (initialGraph.nodes.some(n => n.status === "running")) state.edit(); return state; });
  const [runLock] = useState(() => new CanvasRunLock());
  const runController = useRef<AbortController | null>(null);
  const [runConfirmation, setRunConfirmation] = useState<string | null>(null);
  const runConfirmationResolver = useRef<((confirmed: boolean) => void) | null>(null);
  const requestRunConfirmation = useCallback((message: string) => new Promise<boolean>(resolve => {
    runConfirmationResolver.current?.(false);
    runConfirmationResolver.current = resolve;
    setRunConfirmation(message);
  }), []);
  const settleRunConfirmation = useCallback((confirmed: boolean) => {
    const resolve = runConfirmationResolver.current;
    if (!resolve) return;
    runConfirmationResolver.current = null;
    setRunConfirmation(null);
    resolve(confirmed);
  }, []);
  useEffect(() => () => {
    runConfirmationResolver.current?.(false);
    runConfirmationResolver.current = null;
  }, []);
  const nameRef = useRef(initialName);
  const [saving, setSaving] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 80, y: 60 });
  const [zoom, setZoom] = useState(1);
  const [interaction, setInteraction] = useState<Interaction>(null);
  const [connection, setConnection] = useState<ConnectionSession | null>(null);
  const connectionRef = useRef<ConnectionSession | null>(null);
  const connectionSequence = useRef(0);
  const [hoveredPort, setHoveredPort] = useState<string | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [portOffsets, setPortOffsets] = useState<Map<string, PortOffsets>>(() => new Map());
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [assetLibrary, setAssetLibrary] = useState<AssetLite[] | null>(runtime ? [] : null);
  const [consumerVideoModels, setVideoModels] = useState<{ id: string; name: string }[]>([]);
  const videoModels = runtime?.videoModels ?? consumerVideoModels;
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
    const next = invalidateChanged(current, fn(current));
    commitGraph(next);
  }, [runLock, commitGraph]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (saveState.dirty || saveState.saving || runLock.busy) { e.preventDefault(); e.returnValue = ""; }
    };
    const leave = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || e.ctrlKey || e.metaKey || e.shiftKey || link.href === location.href) return;
      if ((saveState.dirty || saveState.saving || runLock.busy) && !confirm(tr("畫布尚有未儲存內容或執行中的工作。確定離開？可先取消並儲存或匯出草稿。"))) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", guard);
    document.addEventListener("click", leave, true);
    return () => { window.removeEventListener("beforeunload", guard); document.removeEventListener("click", leave, true); runController.current?.abort(); };
  }, [saveState, runLock, tr]);

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panRef.current.x) / zoomRef.current,
      y: (clientY - rect.top - panRef.current.y) / zoomRef.current,
    };
  }, []);

  const ensureAssets = useCallback(() => {
    if (runtime || assetLibrary !== null) return;
    fetch("/api/assets")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((j: { assets: AssetLite[] }) => setAssetLibrary(j.assets))
      .catch(() => setAssetLibrary([]));
  }, [assetLibrary, runtime]);

  useEffect(() => {
    if (runtime) return;
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : { models: [] }))
      .then((j: { models: { id: string; modality: string; displayName?: string }[] }) =>
        // /api/models already returns them pre-sorted (grouped by family,
        // admin overrides honoured) — no reason to re-sort here too.
        setVideoModels(j.models.filter((m) => m.modality === "video" && !/nsfw/i.test(m.id) && videoResolutionsForModel(m.id).length > 0).map((m) => ({ id: m.id, name: modelLabel(m.displayName ?? m.id) })))
      )
      .catch(() => {});
  }, [runtime]);

  /* ---- pan / zoom / drag-node / connect-edge: one set of window listeners ---- */
  useEffect(() => {
    if (!interaction) return;

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== interaction.pointerId) return;
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

    const onUp = (event: PointerEvent) => { if (event.pointerId === interaction.pointerId) setInteraction(null); };
    const onBlur = () => setInteraction(null);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [interaction, toWorld, mutate]);

  /* ---- wheel-to-zoom (native listener so preventDefault actually works) ---- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Preserve reading/editing inside nodes. Ctrl+wheel (trackpad pinch) still
      // zooms the stage wherever the pointer is, including over a prompt.
      if (e.deltaY === 0) return;
      if (!e.ctrlKey) {
        let target = e.target instanceof Element ? e.target : null;
        if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
        while (target && target !== el) {
          const { overflowY } = getComputedStyle(target);
          if ((overflowY === "auto" || overflowY === "scroll") && target.scrollHeight > target.clientHeight + 1) return;
          target = target.parentElement;
        }
      }
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const worldX = (cx - panRef.current.x) / zoomRef.current;
      const worldY = (cy - panRef.current.y) / zoomRef.current;
      const next = Math.min(2.5, Math.max(0.15, zoomRef.current * (e.deltaY < 0 ? 1.1 : 0.9)));
      const nextPan = { x: cx - worldX * next, y: cy - worldY * next };
      zoomRef.current = next; panRef.current = nextPan;
      setZoom(next); setPan(nextPan);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* ---- delete key ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (view !== "canvas" || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag ?? "") || (document.activeElement as HTMLElement)?.isContentEditable) return;
      if (selectedNode) {
        mutate((g) => ({
          nodes: g.nodes.filter((n) => n.id !== selectedNode),
          edges: g.edges.filter((ed) => ed.fromNode !== selectedNode && ed.toNode !== selectedNode),
        }));
        setSelectedNode(null);
      } else if (selectedEdge) {
        mutate((g) => ({ ...g, edges: g.edges.filter((ed) => ed.id !== selectedEdge) }));
        setSelectedEdge(null);
        setConnectionMessage(connectionCopy.removed);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedNode, selectedEdge, mutate, view, connectionCopy]);

  /* ---- save ---- */
  const save = async () => {
    if (saveState.saving || runLock.busy) return;
    const snapshot = { name: nameRef.current, graph: graphRef.current };
    setSaving(true); setSaveError(null);
    try {
      validateGraph(snapshot.graph);
      await saveState.save(async version => {
        const res = await fetch(`${runtime?.apiBasePath ?? "/api/canvas"}/${workflowId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...snapshot, version }),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error?.message || tr("儲存失敗（{s}），草稿仍保留", { s: res.status }));
        if (result.workflow?.id !== workflowId) throw new Error(tr("儲存回應與畫布不符，請保留草稿"));
        return { version: result.workflow.version };
      });
    } catch (e) { setSaveError(e instanceof Error ? e.message : tr("儲存失敗，草稿仍保留")); }
    finally { setSaving(false); setDirty(saveState.dirty); }
  };
  const exportDraft = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ name: nameRef.current, graph: graphRef.current, version: saveState.version }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `canvas-${workflowId}-draft.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /* ---- node ops ---- */
  const addNode = (type: CanvasNodeType, at?: { x: number; y: number }) => {
    const pos = at ?? { x: (40 - panRef.current.x) / zoomRef.current, y: (60 - panRef.current.y) / zoomRef.current };
    if (!at) {
      let attempts = 0;
      while (attempts++ < 200 && graphRef.current.nodes.some(node => {
        const bounds = portOffsets.get(node.id)?.__bounds;
        return pos.x < node.x + (node.width ?? NODE_WIDTH) + 32 && pos.x + NODE_WIDTH + 32 > node.x && pos.y < node.y + (bounds?.y ?? 300) + 32 && pos.y + 280 > node.y;
      })) pos.x += NODE_WIDTH + 56;
      const box = containerRef.current?.getBoundingClientRect();
      if (box && (pos.x * zoomRef.current + panRef.current.x + NODE_WIDTH * zoomRef.current > box.width - 24)) {
        setPan({ x: 40 - pos.x * zoomRef.current, y: 60 - pos.y * zoomRef.current });
      }
    }
    const node: CanvasNode = { id: newId("node"), type, x: pos.x, y: pos.y, data: runtime?.defaultNodeData(type) ?? defaultNodeData(type), status: "idle" };
    mutate((g) => ({ ...g, nodes: [...g.nodes, node] }));
    setAddMenuOpen(false);
    if (!runtime && type === "loadImage") ensureAssets();
  };

  const updateNodeData = (id: string, patch: Record<string, unknown>) => {
    mutate((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) }));
  };

  const execute = async (nodeId?: string, reuseCompleted = false) => {
    if (saveState.saving) return;
    await runLock.run(async () => {
      setRunningAll(true); setSaveError(null);
      const controller = new AbortController(); runController.current = controller;
      try {
        const snapshot = structuredClone(validateGraph(graphRef.current));
        const order = nodeId ? (reuseCompleted ? plannedShotRun(snapshot, nodeId) : upstreamOrder(snapshot, nodeId)) : topoOrder(snapshot);
        if (!order || (nodeId && !order.length)) throw new Error(tr("圖裡有循環連接，請先移除循環連線"));
        if (runtime) {
          if (!(await runtime.confirmRun(snapshot, order))) return;
        } else {
          const currentRatesResponse = await fetch("/api/rates", { cache: "no-store" });
          if (!currentRatesResponse.ok) throw new Error(tr("無法取得點數費率，請稍後再試"));
          const currentRates = (await currentRatesResponse.json()).rates ?? [];
          if (controller.signal.aborted) return;
          setRates(currentRates);
          const credits = canvasRunCredits(snapshot, currentRates, order);
          if (credits === null) throw new Error(tr("部分模型尚未設定有效點數費率或解析度，請更換設定後再執行"));
          if (!(await requestRunConfirmation(connectionCopy.run.replace("{n}", String(order.length)).replace("{c}", String(credits))))) return;
        }
        await executeGraph(snapshot, order, (id, patch) => {
          if (!controller.signal.aborted) commitGraph({ ...graphRef.current, nodes: graphRef.current.nodes.map(n => n.id === id ? { ...n, ...patch } : n) });
        }, controller.signal, runtime ? (node, inputs) => runtime.runNode(node, inputs, controller.signal) : undefined);
      } catch (e) { if (!controller.signal.aborted) setSaveError(e instanceof Error ? e.message : tr("執行失敗")); }
      finally { if (!controller.signal.aborted) setRunningAll(false); runController.current = null; }
    });
  };
  const runOne = (id: string) => execute(id);
  const runAll = () => execute();

  const addShot = () => {
    const id = newId("shot");
    mutate(g => ({...g,nodes:[...g.nodes,{id,type:"video",x:orderedShots(g).length*300,y:360,data:{...defaultNodeData("video"),shotTitle:tr("分鏡 {n}", {n:orderedShots(g).length+1}),shotOrder:orderedShots(g).length},status:"idle"}]}));
    setSelectedNode(id);
  };
  const connectSource = (id:string, source:string) => mutate(g => ({...g,edges:[...g.edges.filter(e=>!(e.toNode===id&&e.toPort==="image")),...(source?[{id:newId("edge"),fromNode:source,fromPort:"out",toNode:id,toPort:"image"}]:[])]}));
  const openShotStage = (id:string) => {
    const g=graphRef.current;
    const source=g.edges.find(e=>e.toNode===id&&e.toPort==="image")?.fromNode;
    if(g.nodes.find(n=>n.id===source)?.type==="director3d") {setDirector3dNodeId(source!);return;}
    if(g.nodes.length>=200) {setSaveError(tr("畫布已達 200 個節點，請先整理"));return;}
    if(source && !confirm(tr("將建立 3D 構圖並替換此鏡的參考連線。原素材節點會保留，是否繼續？"))) return;
    const stageId=newId("stage");
    mutate(current=>({...current,nodes:[...current.nodes,{id:stageId,type:"director3d",x:0,y:0,data:defaultNodeData("director3d")}],edges:[...current.edges.filter(e=>!(e.toNode===id&&e.toPort==="image")),{id:newId("edge"),fromNode:stageId,fromPort:"out",toNode:id,toPort:"image"}]}));
    setDirector3dNodeId(stageId);
  };
  const focusNode = useCallback((id: string) => {
    const node = graphRef.current.nodes.find(item => item.id === id);
    const box = containerRef.current?.getBoundingClientRect();
    if (!node || !box) return;
    const scale = Math.min(1, (box.width - 64) / (node.width ?? NODE_WIDTH));
    const nextPan = { x: (box.width - (node.width ?? NODE_WIDTH) * scale) / 2 - node.x * scale, y: 52 - node.y * scale };
    zoomRef.current = scale; panRef.current = nextPan;
    setZoom(scale); setPan(nextPan); setSelectedNode(id);
  }, []);
  const zoomAtCenter = (factor: number) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    const current = zoomRef.current;
    const next = Math.min(2.5, Math.max(.15, current * factor));
    const nextPan = { x: box.width / 2 - (box.width / 2 - panRef.current.x) * next / current, y: box.height / 2 - (box.height / 2 - panRef.current.y) * next / current };
    zoomRef.current = next; panRef.current = nextPan;
    setZoom(next); setPan(nextPan);
  };
  const fitCanvas = useCallback(() => {
    const nodes=graphRef.current.nodes; const box=containerRef.current?.getBoundingClientRect();
    if(!nodes.length||!box) return;
    const left=Math.min(...nodes.map(n=>n.x)), top=Math.min(...nodes.map(n=>n.y));
    const right=Math.max(...nodes.map(n=>n.x+(n.width??NODE_WIDTH))), bottom=Math.max(...nodes.map(n=>n.y+(portOffsets.get(n.id)?.__bounds.y ?? 300)));
    const scale=Math.max(.15,Math.min(1,(box.width-80)/(right-left),(box.height-80)/(bottom-top)));
    const nextPan = {x:(box.width-(right-left)*scale)/2-left*scale,y:40-top*scale};
    zoomRef.current = scale; panRef.current = nextPan;
    setZoom(scale); setPan(nextPan);
  }, [portOffsets]);
  const initiallyFitted = useRef(false);
  useEffect(() => {
    if (view !== "canvas" || initiallyFitted.current || !graphRef.current.nodes.length || portOffsets.size < graphRef.current.nodes.length) return;
    const frame = requestAnimationFrame(() => {
      if ((containerRef.current?.clientWidth ?? 1000) < 640) focusNode(graphRef.current.nodes[0].id);
      else fitCanvas();
      initiallyFitted.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [view, portOffsets, fitCanvas, focusNode]);
  useEffect(() => {
    const element = containerRef.current;
    if (!element || view !== "canvas") return;
    let width = element.clientWidth;
    let height = element.clientHeight;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      const nextWidth = element.clientWidth;
      const nextHeight = element.clientHeight;
      if (!nextWidth || !nextHeight || (width === nextWidth && height === nextHeight)) return;
      width = nextWidth; height = nextHeight;
      if (!initiallyFitted.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const nodeId = selectedNode ?? graphRef.current.nodes[0]?.id;
        if (width < 640 && nodeId) focusNode(nodeId);
        else fitCanvas();
      });
    });
    observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [view, selectedNode, fitCanvas, focusNode]);

  const totalCredits = canvasRunCredits(graph, rates);
  const selectedCredits = selectedNode ? canvasRunCredits(graph, rates, upstreamOrder(graph, selectedNode)) : null;
  const directorNode = graph.nodes.find(n => n.id === director3dNodeId);
  const reportPorts = useCallback((nodeId: string, offsets: PortOffsets | null) => {
    setPortOffsets(current => {
      if (offsets === null) { if (!current.has(nodeId)) return current; const next = new Map(current); next.delete(nodeId); return next; }
      if (JSON.stringify(current.get(nodeId)) === JSON.stringify(offsets)) return current;
      const next = new Map(current); next.set(nodeId, offsets); return next;
    });
  }, []);
  const cancelConnection = useCallback(() => {
    connectionRef.current = null; setConnection(null); setHoveredPort(null);
    setConnectionMessage(current => current === connectionCopy.connecting ? connectionCopy.cancelled : current);
  }, [connectionCopy]);
  const completeConnection = useCallback((source: ConnectionSource, target: ConnectionTarget) => {
    const rejection = connectionRejection(graphRef.current, source, target);
    if (rejection) { setConnectionMessage(connectionCopy[rejection]); cancelConnection(); return; }
    mutate(current => connectCanvasPorts(current, source, target, newId("edge")));
    setConnectionMessage(connectionCopy.connected); cancelConnection();
  }, [mutate, cancelConnection, connectionCopy]);
  const startConnection = (node: CanvasNode, event?: React.PointerEvent, reconnectEdgeId?: string) => {
    if (runLock.busy) return;
    setInteraction(null); setSelectedNode(null); setSelectedEdge(null); setHoveredPort(null);
    const session: ConnectionSession = { fromNode: node.id, fromPort: NODE_SPECS[node.type].output.id, portType: NODE_SPECS[node.type].output.type,
      startedAt: { x: event?.clientX ?? 0, y: event?.clientY ?? 0 }, pointerId: event?.pointerId, pointerType: event?.pointerType, sequence: ++connectionSequence.current, reconnectEdgeId };
    connectionRef.current = session; setConnection(session); setConnectionMessage(connectionCopy.connecting);
  };
  const deleteEdge = (id: string) => { mutate(current => ({ ...current, edges: current.edges.filter(edge => edge.id !== id) })); setSelectedEdge(null); setConnectionMessage(connectionCopy.removed); };


  return (
    <div className={workspaceStyles.workspace} data-workflow-workspace>
      <div className={workspaceStyles.toolbar}>
        <div className={workspaceStyles.identity}>
          <Link href={runtime?.backHref ?? "/canvas"} className={workspaceStyles.back} aria-label={runtime?.backLabel ?? tr("返回")} title={runtime?.backLabel ?? tr("返回")}>
            <IconChevronLeft className="h-4 w-4" />
          </Link>
          <div className={workspaceStyles.project}>
            <div className={workspaceStyles.scope}>{runtime ? workspaceCopy.business : workspaceCopy.studio}</div>
            <h1 className="sr-only">{workspaceCopy.canvas}</h1>
            <input aria-label={workspaceCopy.name} value={name} maxLength={120} disabled={runningAll}
              onChange={e => { nameRef.current = e.target.value; setName(e.target.value); saveState.edit(); setDirty(saveState.dirty); }}
              className={workspaceStyles.projectName} />
          </div>
          <span role="status" className={workspaceStyles.saveState}>{runningAll ? tr("執行中，請勿關閉") : saving ? tr("儲存中…") : dirty ? tr("尚未儲存") : tr("已儲存")}</span>
        </div>
        {runtime?.showDirector !== false && <div className={workspaceStyles.viewSwitch}>
          {([['canvas','流程畫布'],['director','分鏡導演台']] as const).map(([id,label]) => <button key={id} type="button" aria-pressed={view===id} onClick={()=>{setView(id);setAddMenuOpen(false);}}>{tr(label)}</button>)}
        </div>}
        <div className={workspaceStyles.paletteWrap}>
          <button type="button" disabled={runningAll} aria-label={tr("新增節點")} title={tr("新增節點")} aria-expanded={addMenuOpen} aria-controls="workflow-node-menu" onClick={()=>setAddMenuOpen(v=>!v)} className={workspaceStyles.button}>
            <IconPlus className="h-4 w-4" /><span className={workspaceStyles.addLabel}>{tr("新增節點")}</span>
          </button>
          {addMenuOpen && <div id="workflow-node-menu" className={workspaceStyles.palette} onKeyDown={event=>{if(event.key==='Escape') {setAddMenuOpen(false);event.stopPropagation();}}}>
            <div className={workspaceStyles.paletteHeading}><span>{workspaceCopy.palette}</span><button type="button" aria-label={workspaceCopy.close} onClick={()=>setAddMenuOpen(false)}>×</button></div>
            {(runtime?.allowedNodeTypes ?? NODE_TYPES).map(type=>{const Icon=NODE_ICON[type];return <button key={type} type="button" className={workspaceStyles.paletteItem} onClick={()=>addNode(type)}>
              <Icon className="h-4 w-4 shrink-0 text-[#b4b4b4]"/><span><strong>{tr(NODE_SPECS[type].label)}</strong><small>{tr(NODE_SPECS[type].hint)}</small></span>
            </button>;})}
          </div>}
        </div>
        <div className={workspaceStyles.actions}>
          <button type="button" onClick={exportDraft} className={workspaceStyles.quiet}>{tr("匯出草稿")}</button>
          <details className={workspaceStyles.more}><summary aria-label={workspaceCopy.more}>⋯</summary><div><button type="button" onClick={exportDraft}>{tr("匯出草稿")}</button></div></details>
          <button type="button" onClick={save} disabled={saving || runningAll} className={workspaceStyles.button}>{tr("儲存")}</button>
          <button type="button" onClick={runAll} disabled={runningAll || saving || graph.nodes.length===0} className={workspaceStyles.primary}>
            <IconPlay className="h-3.5 w-3.5"/>{runningAll ? tr("執行中…") : tr("全部執行")}
          </button>
        </div>
      </div>

      {runtime ? <div className={workspaceStyles.billing}>{runtime.billingNotice}</div> : <div className={workspaceStyles.billing}>
        <button type="button" onClick={() => setCostDetails(v => !v)} aria-expanded={costDetails} className="text-left">
          {tr("全部執行：約")} {totalCredits === null ? tr("費率未設定") : tr("{n} 點", { n: totalCredits })}　{selectedNode && tr("選取節點含上游：約 {n}　", { n: selectedCredits === null ? tr("費率未設定") : tr("{n} 點", { n: selectedCredits }) })}{costDetails ? tr("收合明細 ▴") : tr("查看點數明細 ▾")}
        </button>
        {costDetails && <div className="mt-2 max-h-36 overflow-auto text-[#b1bfbb]">
          {graph.nodes.map((n, index) => <div key={n.id} className="flex flex-wrap justify-between gap-2 py-1"><span>{index + 1}. {tr(NODE_SPECS[n.type].label)} {n.data.model ? modelLabel(String(n.data.model)) : ""}</span><span>{canvasNodeCredits(n, rates) === null ? tr("費率未設定") : tr("{n} 點", {n:canvasNodeCredits(n, rates) ?? 0})}</span></div>)}
          <p className="pt-2 text-[#849a93]">{tr("依站內費率估算；圖片以每節點 1 張計算，影片依時長及解析度計算。單點執行包含上游節點；每次重跑重新計費，實際扣點以執行紀錄為準。")}</p>
        </div>}
      </div>

      }
      {saveError && <p role="alert" className="shrink-0 bg-[#301919] px-4 py-2 text-sm text-red-200">{saveError}</p>}
      {runtime?.showDirector !== false && view === "director" && <DirectorBoard graph={graph} selectedId={selectedNode} onSelect={setSelectedNode} onChange={updateNodeData} onAdd={addShot}
        onStoryChange={text=>mutate(g=>{const story=g.nodes.find(n=>n.type==='text'&&n.data.directorStory===true);if(story)return {...g,nodes:g.nodes.map(n=>n.id===story.id?{...n,data:{...n.data,text}}:n)};if(g.nodes.length>=200)return g;return {...g,nodes:[...g.nodes,{id:newId('story'),type:'text',x:0,y:-300,data:{text,directorStory:true}}]};})}
        onStorySplit={()=>{const g=graphRef.current;const parts=storyParagraphs(String(g.nodes.find(n=>n.data.directorStory===true)?.data.text??''));if(!parts.length||g.nodes.length+parts.length>200)return;if(!confirm(tr("將新增 {n} 個分鏡，各段文字會成為分鏡敘事。只建立草稿，不扣點。是否繼續？", {n:parts.length})))return;const offset=orderedShots(g).length;const added:CanvasNode[]=parts.map((prompt,i)=>({id:newId('shot'),type:'video',x:(i+offset)*300,y:360,data:{...defaultNodeData('video'),prompt,shotTitle:tr("分鏡 {n}", {n:offset+i+1}),shotOrder:offset+i},status:'idle'}));mutate(current=>({...current,nodes:[...current.nodes,...added]}));setSelectedNode(added[0].id);}}
        busy={runningAll || saving} models={videoModels} onSource={connectSource} onStage={openShotStage} onRun={id=>void execute(id,true)}
        quote={id=>{try{return canvasRunCredits(graph,rates,plannedShotRun(graph,id));}catch{return null;}}}
        onDuplicate={id=>{const original=graphRef.current.nodes.find(n=>n.id===id);if(!original)return;const copyId=newId("shot");mutate(g=>({...g,nodes:[...g.nodes,{...structuredClone(original),id:copyId,x:original.x+280,data:{...structuredClone(original.data),shotTitle:tr("{name} 副本", {name:String(original.data.shotTitle||tr("分鏡"))}),shotOrder:orderedShots(g).length},status:"idle",output:null,error:null}],edges:[...g.edges,...g.edges.filter(e=>e.toNode===id).map(e=>({...e,id:newId("edge"),toNode:copyId}))]}));setSelectedNode(copyId);}}
        onMove={(id,direction)=>mutate(g=>{const shots=orderedShots(g);const index=shots.findIndex(n=>n.id===id);const target=index+direction;if(target<0||target>=shots.length)return g;[shots[index],shots[target]]=[shots[target],shots[index]];return {...g,nodes:g.nodes.map(n=>n.type==='video'?{...n,data:{...n.data,shotOrder:shots.findIndex(s=>s.id===n.id)}}:n)};})}
        onDelete={id=>{if(confirm(tr('刪除此分鏡？原始生成紀錄仍保留。')))mutate(g=>({...g,nodes:g.nodes.filter(n=>n.id!==id),edges:g.edges.filter(e=>e.fromNode!==id&&e.toNode!==id)}));}}
      />}
      {/* Keep the canvas mounted so its wheel/viewport bindings survive view switching. */}
      <div
        ref={containerRef}
        inert={runningAll}
        className={`${workspaceStyles.stage} ${view === "director" ? "hidden" : ""}`}
        style={{ "--canvas-zoom": zoom } as React.CSSProperties}
        onPointerDown={(e) => {
          const onBackground = e.target === e.currentTarget || (e.target instanceof HTMLElement && e.target.hasAttribute("data-canvas-pan-surface"));
          if (!onBackground || (e.button !== 0 && e.button !== 1)) return;
          cancelConnection();
          setSelectedNode(null);
          setSelectedEdge(null);
          setInteraction({ kind: "pan", startClientX: e.clientX, startClientY: e.clientY, startPan: pan, pointerId: e.pointerId });
        }}
      >
        <div data-canvas-pan-surface className={workspaceStyles.panSurface} />
        <div className={workspaceStyles.stageMeta}><span>{workspaceCopy.nodes.replace("{n}", String(graph.nodes.length))}</span><span>{workspaceCopy.links.replace("{n}", String(graph.edges.length))}</span></div>
        <div
          className="absolute left-0 top-0"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
        >
          <CanvasConnections graph={graph} offsets={portOffsets} session={connection} zoom={zoom} selectedEdge={selectedEdge} toWorld={toWorld}
            onComplete={completeConnection} onCancel={cancelConnection} onHover={setHoveredPort}
            onSelect={id => { setSelectedEdge(id); setSelectedNode(null); cancelConnection(); setConnectionMessage(connectionCopy.selected); }}
            onDelete={deleteEdge} edgeLabel={connectionCopy.edge} />

          {graph.nodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              selected={selectedNode === node.id}
              connection={connection}
              hoveredPort={hoveredPort}
              connectedInputs={graph.edges.filter(edge => edge.toNode === node.id).map(edge => edge.toPort)}
              outputConnected={graph.edges.some(edge => edge.fromNode === node.id)}
              graph={graph}
              onMeasurePorts={reportPorts}
              renderNodeSettings={runtime?.renderNodeSettings}
              onOutputActivate={() => startConnection(node)}
              onInputActivate={target => {
                const active = connectionRef.current;
                if (active) completeConnection(active, target);
              }}
              onInputPortDown={(event, target) => {
                event.stopPropagation();
                if (connectionRef.current) return;
                const existing = graphRef.current.edges.find(edge => edge.toNode === target.nodeId && edge.toPort === target.portId);
                const source = existing && graphRef.current.nodes.find(candidate => candidate.id === existing.fromNode);
                if (source) startConnection(source, event, existing!.id);
              }}
              assetLibrary={assetLibrary}
              videoModels={videoModels}
              onEnsureAssets={ensureAssets}
              onSelect={() => {
                setSelectedNode(node.id);
                setSelectedEdge(null);
              }}
              onHeaderPointerDown={(e) => {
                e.stopPropagation();
                cancelConnection();
                setSelectedNode(node.id);
                setSelectedEdge(null);
                const w = toWorld(e.clientX, e.clientY);
                setInteraction({ kind: "dragNode", id: node.id, offsetX: w.x - node.x, offsetY: w.y - node.y, pointerId: e.pointerId });
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
                  pointerId: e.pointerId,
                  id: node.id,
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  startWidth: node.width ?? NODE_WIDTH,
                  startHeight: node.textHeight ?? DEFAULT_TEXT_HEIGHT,
                });
              }}
              onOutputPortDown={event => { event.stopPropagation(); if (event.button === 0) startConnection(node, event); }}
            />
          ))}
        </div>

        <div className={connectionStyles.toolbar} onPointerDown={event => event.stopPropagation()}>
          <p role="status" aria-live="polite">{connection ? connectionCopy.connecting : connectionMessage ?? connectionCopy.help}</p>
          {connection && <button type="button" onClick={cancelConnection}>{connectionCopy.cancel}</button>}
          {selectedEdge && <button type="button" onClick={() => deleteEdge(selectedEdge)}>{connectionCopy.remove}</button>}
        </div>
        <div className={workspaceStyles.dock} onPointerDown={e=>e.stopPropagation()}>
          {graph.nodes.length>0 && <select className={workspaceStyles.navigator} aria-label={workspaceCopy.focus} value={selectedNode ?? ""} onChange={event=>focusNode(event.target.value)}>
            <option value="" disabled>{workspaceCopy.focus}</option>
            {graph.nodes.map((node,index)=><option key={node.id} value={node.id}>{index+1}. {String(node.data.title || tr(NODE_SPECS[node.type].label))}</option>)}
          </select>}
          <button type="button" aria-label={tr("縮小畫布")} onClick={()=>zoomAtCenter(1/1.2)}>−</button>
          <span className={workspaceStyles.zoom}>{Math.round(zoom*100)}%</span>
          <button type="button" aria-label={tr("放大畫布")} onClick={()=>zoomAtCenter(1.2)}>＋</button>
          <button type="button" aria-label={tr("檢視全貌")} onClick={fitCanvas}>{workspaceCopy.overview}</button>
        </div>
        {graph.nodes.length===0 && <div className={workspaceStyles.empty}><div><h2>{workspaceCopy.emptyTitle}</h2><p>{workspaceCopy.emptyBody}</p></div></div>}
      </div>

      {!runtime && runConfirmation !== null && <CanvasRunConfirmation message={runConfirmation} onDecision={settleRunConfirmation} />}
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
  connection, hoveredPort, connectedInputs, outputConnected, graph, onMeasurePorts, renderNodeSettings, onInputPortDown, onInputActivate, onOutputActivate,
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
  connection: ConnectionSession | null;
  hoveredPort: string | null;
  connectedInputs: string[];
  outputConnected: boolean;
  graph: CanvasGraph;
  onMeasurePorts: (id: string, offsets: PortOffsets | null) => void;
  renderNodeSettings?: CanvasEditorRuntime["renderNodeSettings"];
  onInputPortDown: (event: React.PointerEvent, target: ConnectionTarget) => void;
  onInputActivate: (target: ConnectionTarget) => void;
  onOutputActivate: () => void;
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
  const tr = useTr();
  const locale = useLocale();
  const connectionCopy = canvasConnectionsCopy[locale];
  const cardRef = useRef<HTMLDivElement>(null);
  const spec = NODE_SPECS[node.type];
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const measure = () => {
      const rect = card.getBoundingClientRect();
      const scale = rect.width / Number.parseFloat(getComputedStyle(card).width);
      if (!(scale > 0)) return;
      const offsets: PortOffsets = { __bounds: { x: rect.width / scale, y: rect.height / scale } };
      card.querySelectorAll<HTMLButtonElement>("[data-port-id]").forEach(port => {
        const bounds = port.getBoundingClientRect();
        offsets[port.dataset.portId!] = { x: (bounds.left + bounds.width / 2 - rect.left) / scale, y: (bounds.top + bounds.height / 2 - rect.top) / scale };
      });
      onMeasurePorts(node.id, offsets);
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(card);
    return () => { observer.disconnect(); onMeasurePorts(node.id, null); };
  }, [node.id, node.width, node.type, onMeasurePorts]);
  const settingsOverride = renderNodeSettings?.(node, onDataChange);
  const Icon = NODE_ICON[node.type];
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  // Screen position for the portaled asset picker below — see its own
  // comment for why this can't just be a plain CSS-relative dropdown.
  const [assetPickerPos, setAssetPickerPos] = useState<{ top: number; left: number } | null>(null);

  const fieldCls = workspaceStyles.field;

  return (
    <div
      ref={cardRef}
      data-canvas-node={node.id}
      onPointerDown={onSelect}
      className={workspaceStyles.node}
      data-selected={selected}
      style={{ left: node.x, top: node.y, width: node.width ?? NODE_WIDTH }}
    >
      {/* header */}
      <div
        onPointerDown={onHeaderPointerDown}
        style={{ touchAction: "none" }}
        className={workspaceStyles.nodeHeader}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-[#9a9a9a]" />
        <span className={workspaceStyles.nodeTitle}>{String(node.data.title || tr(spec.label))}</span>
        <StatusDot status={node.status} />
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRun}
          title={tr("執行（會先跑上游節點）")}
          className={workspaceStyles.nodeAction}
        >
          <IconPlay className="h-3 w-3" />
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onDelete}
          title={tr("刪除節點")}
          className={workspaceStyles.nodeAction}
        >
          <IconTrash className="h-3 w-3" />
        </button>

        {/* The hit target is larger than the visible dot; geometry is measured from this button. */}
        <button type="button" data-port-kind="out" data-node-id={node.id} data-port-id={spec.output.id} data-port-type={spec.output.type}
          aria-label={`${connectionCopy.output}${String(node.data.title || tr(spec.label))} · ${tr(spec.output.label)}`} title={`${connectionCopy.output}${tr(spec.output.label)}`}
          aria-pressed={connection?.fromNode === node.id} onPointerDown={onOutputPortDown}
          onClick={event => { if (event.detail === 0) onOutputActivate(); }}
          className={[connectionStyles.port, connectionStyles.output, outputConnected ? connectionStyles.connected : "", connection?.fromNode === node.id ? connectionStyles.active : ""].join(" ")}
          style={{ "--port-color": CONNECTION_COLORS[spec.output.type] } as React.CSSProperties}>
          <span className={connectionStyles.dot} />
        </button>
      </div>

      {spec.inputs.map(input => {
        const target = { nodeId: node.id, portId: input.id, type: input.type };
        const compatible = connection ? !connectionRejection(graph, connection, target) : false;
        return <div key={input.id} className={workspaceStyles.inputRow} style={{ height: NODE_PORT_ROW_H }}>
          <button type="button" data-port-kind="in" data-node-id={node.id} data-port-id={input.id} data-port-type={input.type}
            aria-label={`${connectionCopy.input}${String(node.data.title || tr(spec.label))} · ${tr(input.label)}`} title={`${connectionCopy.input}${tr(input.label)}`}
            onPointerDown={event => onInputPortDown(event, target)} onClick={() => onInputActivate(target)}
            className={[connectionStyles.port, connectionStyles.input, connectedInputs.includes(input.id) ? connectionStyles.connected : "", connection ? compatible ? connectionStyles.compatible : connectionStyles.incompatible : "", hoveredPort === canvasPortKey(node.id, input.id) ? connectionStyles.snapped : ""].join(" ")}
            style={{ "--port-color": CONNECTION_COLORS[input.type] } as React.CSSProperties}>
            <span className={connectionStyles.dot} />
          </button>
          <span className="ml-1.5">{tr(input.label)}</span>
        </div>;
      })}

      {/* body */}
      <div className={workspaceStyles.nodeBody} onPointerDown={(e) => e.stopPropagation()}>
        {settingsOverride !== undefined ? settingsOverride : <>
        {node.type === "text" && (
          <textarea
            value={String(node.data.text ?? "")}
            onChange={(e) => onDataChange({ text: e.target.value })}
            placeholder={tr("輸入文字…")}
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
              <label className="mb-2 block text-xs text-neutral-400">{tr("官方角色三視圖")}<select aria-label={tr("官方角色三視圖")} className="mt-1 w-full rounded bg-neutral-800 p-2 text-white" value={String(node.data.officialCharacter || "")} onChange={e => onDataChange({ officialCharacter: e.target.value, items: [] })}><option value="">{tr("使用自己的素材")}</option>{OFFICIAL_CHARACTERS.map(c => <option key={c.id} value={c.id}>{tr(c.name)}</option>)}</select></label>
              {officialCharacter(node.data.officialCharacter) && <Image width={3840} height={2160} alt={tr("角色三視圖參考")} src={officialCharacter(node.data.officialCharacter)!.src} className="mb-2 w-full rounded bg-white" />}
              {items.length > 0 && (
                <div className="grid grid-cols-4 gap-1">
                  {items.map((it) => (
                    <div key={it.assetId} className="group/thumb relative aspect-square overflow-hidden rounded-md border border-[#2c2c2c]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.src} alt={tr(it.name)} title={tr(it.name)} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => onDataChange({ items: items.filter((x) => x.assetId !== it.assetId) })}
                        aria-label={tr("移除")}
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
                {items.length > 0 ? tr("再選一張（已選 {n} 張）", { n: items.length }) : tr("選擇素材（可選多張）")}
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
                    <span className="text-[11px] text-white">{tr("選擇素材（可複選）")}</span>
                    <button type="button" onClick={() => setAssetPickerOpen(false)} className="text-[12px] text-[#8a8a8a] hover:text-white">
                      {tr("完成")}
                    </button>
                  </div>
                  <div className="grid max-h-[200px] grid-cols-4 gap-1.5 overflow-y-auto">
                    {assetLibrary === null && <span className="col-span-4 py-3 text-center text-[11px] text-[#6d6d6d]">{tr("載入中…")}</span>}
                    {assetLibrary?.length === 0 && <span className="col-span-4 py-3 text-center text-[11px] text-[#6d6d6d]">{tr("資產庫還沒有圖片")}</span>}
                    {assetLibrary?.map((a) => {
                      const on = selectedIds.has(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          title={tr(a.name)}
                          onClick={() => toggle(a)}
                          className={`relative aspect-square overflow-hidden rounded-md border ${on ? "border-[#7ff0cd]" : "border-[#2a2a2a] hover:border-[#4a4a4a]"}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.src} alt={tr(a.name)} className="h-full w-full object-cover" />
                          {on && <span className="absolute inset-0 grid place-items-center bg-black/40 text-[11px] text-[#7ff0cd]"><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg></span>}
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
              {/nsfw/i.test(String(node.data.model ?? "")) && <option value={String(node.data.model)} disabled>{tr("請重新選擇模型")}</option>}
              {IMAGE_MODELS.filter((m) => !/nsfw/i.test(m.id)).map((m) => (
                <option key={m.id} value={m.id}>
                  {modelLabel(m.name)}{isNewModel(m.id) ? " · NEW" : ""}
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
              placeholder={tr("沒接文字節點時用這裡的 prompt")}
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
            <select value={String(node.data.model ?? "")} onChange={(e) => { const next = videoConstraintFor(e.target.value); onDataChange({ model: e.target.value, resolution: normalizeVideoResolution(e.target.value, String(node.data.resolution ?? "480p")), seconds: Math.max(next.minSeconds, Math.min(currentSeconds, next.maxSeconds)) }); }} className={fieldCls}>
              {/nsfw/i.test(String(node.data.model ?? "")) && <option value={String(node.data.model)} disabled>{tr("請重新選擇模型")}</option>}
              {videoModels.length === 0 && <option value="">{tr("載入中…")}</option>}
              {videoModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {modelLabel(m.name)}
                </option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <input
                type="number"
                min={constraint.minSeconds}
                max={constraint.maxSeconds}
                value={Math.max(constraint.minSeconds,Math.min(currentSeconds, constraint.maxSeconds))}
                onChange={(e) => onDataChange({ seconds: Number(e.target.value) })}
                className={fieldCls + " w-1/2"}
              />
              <select value={videoResolutionsForModel(String(node.data.model ?? "")).includes(String(node.data.resolution ?? "480p") as never) ? String(node.data.resolution ?? "480p") : ""} onChange={(e) => onDataChange({ resolution: e.target.value })} className={fieldCls + " w-1/2"}>
                <option value="" disabled>{tr("請選擇支援的解析度")}</option>
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
              placeholder={tr("沒接文字節點時用這裡的 prompt")}
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
              <img src={String(node.data.capturedImage)} alt={tr("3D 截圖")} className="w-full rounded-lg border border-[#2c2c2c]" />
            ) : (
              <div className="grid h-20 place-items-center rounded-lg border border-dashed border-[#3a3a3a] text-[11px] text-[#6d6d6d]">
                {tr("還沒截圖")}
              </div>
            )}
            <button
              type="button"
              onClick={onOpenDirector3D}
              className="w-full rounded-lg border border-[#3a3a3a] bg-[#1c1c1c] py-1.5 text-[11.5px] text-[#c9c9c9] hover:border-[#555]"
            >
              {tr("開啟 3D 導演台")}
            </button>
          </>
        )}

        </>}

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
            {tr(node.output.text)}
          </div>
        )}
        {node.error && <div className="rounded-lg border border-[#4a2020] bg-[#1a1010] p-2 text-[11px] text-[#ff9b9b]">{node.error}</div>}
      </div>

      {/* resize handle — drags width + the text area's height together, see the "resizeNode" interaction in CanvasEditor */}
      <div
        onPointerDown={onResizePointerDown}
        style={{ touchAction: "none" }}
        title={tr("拖曳調整節點大小")}
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
  if (status === "running") return <span className="h-2 w-2 shrink-0 rounded-full bg-[#f0d27f]" />;
  if (status === "done") return <span className="h-2 w-2 shrink-0 rounded-full bg-[#7ff0cd]" />;
  return <span className="h-2 w-2 shrink-0 rounded-full bg-[#ff6b6b]" />;
}
