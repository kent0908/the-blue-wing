"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconChevronLeft, IconPlus, IconClose } from "@/components/Icons";
import MaskPainter from "@/components/layerEditor/MaskPainter";
import CompareModal from "@/components/layerEditor/CompareModal";
import OutpaintDialog from "@/components/layerEditor/OutpaintDialog";
import ExportDialog from "@/components/layerEditor/ExportDialog";
import ProjectsPanel, { type ProjectSummary, type VersionSummary } from "@/components/layerEditor/ProjectsPanel";
import LayerList from "@/components/layerEditor/LayerList";
import PropertiesPanel, { type LayerAction } from "@/components/layerEditor/PropertiesPanel";
import CanvasStage, { type CropDraft, type StageMode } from "@/components/layerEditor/CanvasStage";
import {
  CANVAS_SIZES,
  FULL_CROP,
  bakeLayerPixels,
  bakedPatch,
  buildOutpaintRequest,
  defaultDoc,
  docBytes,
  fitLayer,
  flattenLayers,
  loadImage,
  naturalSize,
  newLayerId,
  newTextLayer,
  normalizeDoc,
  revertPatch,
  toDataUrl,
  type EditorDoc,
  type EditorLayer,
  type OutpaintMargins,
} from "@/lib/layerEditor";
import { uploadAsset } from "@/lib/uploadAsset";
import { DIRECTOR3D_HANDOFF_KEY } from "@/lib/canvas/director3d";

interface AssetLite {
  id: number;
  src: string;
  name: string;
}

const ANNOTATION_LAYER_NAME = "標記";
const AUTOSAVE_MS = 1200;

async function editImage(body: { prompt: string; image: string; mask?: string }): Promise<string> {
  const res = await fetch("/api/images/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message || (res.status === 413 ? "圖片太大，請換一張較小的圖片再試" : `失敗（HTTP ${res.status}）`));
  if (!json?.url) throw new Error("沒有取得結果");
  return json.url as string;
}

/**
 * 圖層編輯 — see lib/layerEditor.ts for the data model / renderer and the
 * components/layerEditor/* pieces this page wires together. The document
 * autosaves to the account (app/api/editor/projects) whenever it changes;
 * signed-out users can still edit, just without persistence.
 */
export default function LayerEditorPage() {
  const router = useRouter();
  const [doc, setDoc] = useState<EditorDoc>(defaultDoc);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitRequest, setFitRequest] = useState(0);
  const [mode, setMode] = useState<StageMode>("select");
  const [cropDraft, setCropDraft] = useState<CropDraft | null>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetLibrary, setAssetLibrary] = useState<AssetLite[] | null>(null);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [redrawFor, setRedrawFor] = useState<EditorLayer | null>(null);
  const [redrawError, setRedrawError] = useState<string | null>(null);
  const [outpaintFor, setOutpaintFor] = useState<EditorLayer | null>(null);
  const [outpaintError, setOutpaintError] = useState<string | null>(null);
  const [compareFor, setCompareFor] = useState<EditorLayer | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const annotateCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { canvas, layers } = doc;
  const selected = layers.find((l) => l.id === selectedId) ?? null;
  const annotationIds = new Set(layers.filter((l) => l.name === ANNOTATION_LAYER_NAME).map((l) => l.id));
  const hasAnnotation = annotationIds.size > 0;

  /* ---- undo / redo: one snapshot per user gesture ---- */
  const [history, setHistory] = useState<EditorDoc[]>([]);
  const [future, setFuture] = useState<EditorDoc[]>([]);
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  const snapshot = useCallback(() => {
    setHistory((h) => [...h.slice(-49), docRef.current]);
    setFuture([]);
  }, []);
  const undo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [...f, docRef.current]);
    setDoc(prev);
  };
  const redo = () => {
    if (!future.length) return;
    const next = future[future.length - 1];
    setFuture((f) => f.slice(0, -1));
    setHistory((h) => [...h, docRef.current]);
    setDoc(next);
  };

  const setLayers = (fn: (cur: EditorLayer[]) => EditorLayer[]) => setDoc((d) => ({ ...d, layers: fn(d.layers) }));
  const patchLayer = useCallback((id: string, patch: Partial<EditorLayer>, withSnapshot = false) => {
    if (withSnapshot) snapshot();
    setDoc((d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  }, [snapshot]);

  /* ---- projects: load list, autosave, versions ---- */
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projectName, setProjectName] = useState("未命名專案");
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  // "dirty" is derived (doc/name differ from what was last persisted) so the
  // autosave effect only schedules work and never sets state synchronously
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [saved, setSaved] = useState<{ doc: EditorDoc | null; name: string }>({ doc: null, name: "" });
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const skipSaveRef = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshProjects = useCallback(async () => {
    const r = await fetch("/api/editor/projects", { cache: "no-store" });
    if (r.status === 401) {
      setSignedIn(false);
      return;
    }
    if (!r.ok) return;
    setSignedIn(true);
    setProjects(((await r.json()) as { projects: ProjectSummary[] }).projects);
  }, []);
  const refreshVersions = useCallback(async (id: number) => {
    const r = await fetch(`/api/editor/projects/${id}/versions`, { cache: "no-store" });
    if (r.ok) setVersions(((await r.json()) as { versions: VersionSummary[] }).versions);
  }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/editor/projects", { cache: "no-store" })
      .then((r) => (r.status === 401 ? null : r.ok ? r.json() : Promise.reject(new Error())))
      .then((j: { projects: ProjectSummary[] } | null) => {
        if (!alive) return;
        setSignedIn(!!j);
        if (j) setProjects(j.projects);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const openProject = async (id: number) => {
    const r = await fetch(`/api/editor/projects/${id}`, { cache: "no-store" });
    if (!r.ok) return setError("載入專案失敗");
    const j = (await r.json()) as { project: ProjectSummary; doc: unknown };
    const loaded = normalizeDoc(j.doc);
    skipSaveRef.current = true;
    setDoc(loaded);
    setHistory([]);
    setFuture([]);
    setSelectedId(null);
    setProjectId(id);
    setProjectName(j.project.name);
    setSaved({ doc: loaded, name: j.project.name });
    setSaveStatus("idle");
    void refreshVersions(id);
  };
  const newProject = () => {
    skipSaveRef.current = true;
    setDoc(defaultDoc());
    setHistory([]);
    setFuture([]);
    setSelectedId(null);
    setProjectId(null);
    setProjectName("未命名專案");
    setVersions([]);
    setSaved({ doc: null, name: "" });
    setSaveStatus("idle");
  };
  const deleteProject = async (id: number) => {
    if (!confirm("刪除這個專案？版本歷史也會一起刪掉。")) return;
    await fetch(`/api/editor/projects/${id}`, { method: "DELETE" });
    if (id === projectId) newProject();
    void refreshProjects();
  };

  // autosave (debounced) — creates the project on first change, updates after
  const persist = useCallback(async (d: EditorDoc, name: string) => {
    if (!signedIn) return;
    setSaveStatus("saving");
    try {
      if (projectId === null) {
        const r = await fetch("/api/editor/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, doc: d }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error?.message || "儲存失敗");
        setProjectId(Number(j.project.id));
      } else {
        const r = await fetch(`/api/editor/projects/${projectId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, doc: d }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error?.message || "儲存失敗");
      }
      setSaved({ doc: d, name });
      setSaveStatus("idle");
      void refreshProjects();
    } catch (e) {
      setSaveStatus("error");
      setError(e instanceof Error ? e.message : "儲存失敗");
    }
  }, [signedIn, projectId, refreshProjects]);
  useEffect(() => {
    if (!signedIn) return;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    if (!doc.layers.length && projectId === null) return; // nothing worth a row yet
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist(doc, projectName), AUTOSAVE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // persist identity changes with projectId — intended: the first save turns POST into PUT
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, projectName, signedIn]);

  const saveVersion = useCallback(async (label: string, d = docRef.current) => {
    if (!signedIn) return;
    let id = projectId;
    if (id === null) {
      const r = await fetch("/api/editor/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: projectName, doc: d }) });
      if (!r.ok) return;
      id = Number((await r.json()).project.id);
      setProjectId(id);
    }
    await fetch(`/api/editor/projects/${id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, doc: d }) });
    void refreshVersions(id);
  }, [signedIn, projectId, projectName, refreshVersions]);
  const restoreVersion = async (versionId: number) => {
    if (projectId === null) return;
    await saveVersion("回到舊版前的狀態");
    const r = await fetch(`/api/editor/projects/${projectId}/versions/${versionId}`);
    if (!r.ok) return setError("載入版本失敗");
    const j = (await r.json()) as { doc: unknown };
    snapshot();
    setDoc(normalizeDoc(j.doc));
    setSelectedId(null);
  };

  /* ---- adding layers ---- */
  const addImageLayer = async (src: string, name: string) => {
    try {
      const { w, h } = await naturalSize(src);
      const layer = fitLayer(src, name, canvas.width, canvas.height, w, h);
      snapshot();
      setLayers((cur) => [...cur, layer]);
      setSelectedId(layer.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "圖片載入失敗");
    }
  };
  /** Uploads go to 資產庫 first so the project document only stores a URL; if that fails the image still comes in as a data URL (won't persist well). */
  const handleUpload = async (files: FileList) => {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const asset = await uploadAsset(file);
        await addImageLayer(asset.src, asset.name);
        setAssetLibrary((cur) => (cur ? [asset, ...cur] : cur));
      } catch (e) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("讀取檔案失敗"));
          reader.readAsDataURL(file);
        });
        await addImageLayer(dataUrl, file.name);
        setNotice(`「${file.name}」沒能存進資產庫（${e instanceof Error ? e.message : "上傳失敗"}），這張只會保存在本次編輯中`);
      }
    }
  };
  const ensureAssets = () => {
    if (assetLibrary !== null) return;
    fetch("/api/assets")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((j: { assets: AssetLite[] }) => setAssetLibrary(j.assets))
      .catch(() => setAssetLibrary([]));
  };
  const addText = () => {
    snapshot();
    const layer = newTextLayer(canvas.width, canvas.height);
    setLayers((cur) => [...cur, layer]);
    setSelectedId(layer.id);
  };

  /* ---- layer ops ---- */
  const removeLayer = (id: string) => {
    snapshot();
    setLayers((cur) => cur.filter((l) => l.id !== id));
    if (selectedId === id) setSelectedId(null);
  };
  const duplicateLayer = (id: string) => {
    const src = layers.find((l) => l.id === id);
    if (!src) return;
    snapshot();
    const copy: EditorLayer = { ...src, id: newLayerId(), name: `${src.name} 副本`, x: src.x + 20, y: src.y + 20, locked: false };
    setLayers((cur) => {
      const i = cur.findIndex((l) => l.id === id);
      return [...cur.slice(0, i + 1), copy, ...cur.slice(i + 1)];
    });
    setSelectedId(copy.id);
  };
  const moveLayer = (id: string, dir: -1 | 1) => {
    snapshot();
    setLayers((cur) => {
      const i = cur.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const reorderLayer = (id: string, beforeId: string | null) => {
    snapshot();
    setLayers((cur) => {
      const moving = cur.find((l) => l.id === id);
      if (!moving) return cur;
      const rest = cur.filter((l) => l.id !== id);
      // the list is shown reversed (top = front): dropping onto a row means "take that row's slot"
      const idx = beforeId ? rest.findIndex((l) => l.id === beforeId) : -1;
      if (idx < 0) return [...rest, moving];
      return [...rest.slice(0, idx + 1), moving, ...rest.slice(idx + 1)];
    });
  };
  const toEdge = (id: string, edge: "front" | "back") => {
    snapshot();
    setLayers((cur) => {
      const l = cur.find((x) => x.id === id);
      if (!l) return cur;
      const rest = cur.filter((x) => x.id !== id);
      return edge === "front" ? [...rest, l] : [l, ...rest];
    });
  };

  /* ---- crop ---- */
  const startCrop = () => {
    if (!selected || selected.kind !== "image") return;
    setMode("crop");
    setCropDraft({ x: selected.x, y: selected.y, width: selected.width, height: selected.height });
  };
  const confirmCrop = () => {
    if (!selected || !cropDraft) return;
    const c = selected.crop ?? FULL_CROP;
    const fullW = selected.width / c.w;
    const fullH = selected.height / c.h;
    const fullX = selected.x - c.x * fullW;
    const fullY = selected.y - c.y * fullH;
    // clamp the draft to the source
    const x0 = Math.max(fullX, cropDraft.x);
    const y0 = Math.max(fullY, cropDraft.y);
    const x1 = Math.min(fullX + fullW, cropDraft.x + cropDraft.width);
    const y1 = Math.min(fullY + fullH, cropDraft.y + cropDraft.height);
    if (x1 - x0 < 4 || y1 - y0 < 4) return cancelCrop();
    patchLayer(selected.id, { crop: { x: (x0 - fullX) / fullW, y: (y0 - fullY) / fullH, w: (x1 - x0) / fullW, h: (y1 - y0) / fullH }, x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, true);
    cancelCrop();
  };
  const cancelCrop = () => {
    setMode("select");
    setCropDraft(null);
  };

  /* ---- AI: generate / redraw / outpaint / remove bg ---- */
  const generate = async () => {
    if (!prompt.trim()) return;
    setError(null);
    setGenerating(true);
    try {
      const composite = await flattenLayers(layers, canvas.width, canvas.height, canvas.background);
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "Dola-Seedream-5.0-pro", prompt: prompt.trim(), n: 1, size: "2048x2048", response_format: "url", image: layers.length ? composite : undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || "生成失敗");
      const url = json?.images?.[0]?.url;
      if (!url) throw new Error("沒有取得生成結果");
      void saveVersion("AI 生成前");
      await addImageLayer(url, "AI 生成結果");
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失敗，請稍後再試");
    } finally {
      setGenerating(false);
    }
  };

  const submitRedraw = async (regions: { prompt: string; mask: string }[]) => {
    if (!redrawFor) return;
    setRedrawError(null);
    setBusy("redraw");
    try {
      const image = await bakeLayerPixels(redrawFor, 1280);
      const source = await toDataUrl(image, 1280, true);
      void saveVersion("局部重繪前");
      const results: string[] = [];
      for (const r of regions) results.push(await editImage({ prompt: r.prompt, image: source, mask: r.mask }));
      snapshot();
      if (results.length === 1) {
        patchLayer(redrawFor.id, bakedPatch(results[0], redrawFor));
      } else {
        // batch: each result becomes its own layer stacked over the original so any can be toggled/kept
        setLayers((cur) => {
          const i = cur.findIndex((l) => l.id === redrawFor.id);
          const extra = results.map((url, k) => ({ ...redrawFor, ...bakedPatch(url, redrawFor), id: newLayerId(), name: `${redrawFor.name} 重繪 ${k + 1}`, locked: false }));
          return [...cur.slice(0, i + 1), ...extra, ...cur.slice(i + 1)];
        });
      }
      setRedrawFor(null);
    } catch (e) {
      setRedrawError(e instanceof Error ? e.message : "重繪失敗，請稍後再試");
    } finally {
      setBusy(null);
    }
  };

  const submitOutpaint = async (margins: OutpaintMargins, p: string) => {
    if (!outpaintFor) return;
    setOutpaintError(null);
    setBusy("outpaint");
    try {
      const baked = await bakeLayerPixels(outpaintFor, 1024);
      const req = await buildOutpaintRequest(baked, margins, 1536);
      void saveVersion("擴圖前");
      const url = await editImage({ prompt: p, image: req.image, mask: req.mask });
      // grow the layer so the original stays at the same place/size on the canvas
      const sx = outpaintFor.width / req.inner.w;
      const sy = outpaintFor.height / req.inner.h;
      snapshot();
      patchLayer(outpaintFor.id, { ...bakedPatch(url, outpaintFor), x: outpaintFor.x - req.inner.x * sx, y: outpaintFor.y - req.inner.y * sy, width: req.width * sx, height: req.height * sy });
      setOutpaintFor(null);
    } catch (e) {
      setOutpaintError(e instanceof Error ? e.message : "擴圖失敗，請稍後再試");
    } finally {
      setBusy(null);
    }
  };

  const removeBg = async (layer: EditorLayer) => {
    setError(null);
    setBusy("removeBg");
    try {
      const { removeBackground } = await import("@/components/layerEditor/models");
      const baked = await bakeLayerPixels(layer, 1536);
      const out = await removeBackground(baked, (m) => setNotice(m));
      await loadImage(out);
      // keep the project document small: park the PNG in 資產庫 and reference it (data URL only if that fails)
      let src = out;
      try {
        const blob = await fetch(out).then((r) => r.blob());
        const asset = await uploadAsset(new File([blob], `${layer.name.replace(/\.[a-z0-9]+$/i, "")}-去背.png`, { type: "image/png" }));
        src = asset.src;
        await loadImage(src);
      } catch {
        // stays a data URL for this session
      }
      snapshot();
      patchLayer(layer.id, bakedPatch(src, layer));
      setNotice("去背完成 — 用「前後比對」檢查邊緣，不滿意可回復");
    } catch (e) {
      setError(e instanceof Error ? e.message : "去背失敗");
    } finally {
      setBusy(null);
    }
  };

  const onAction = (action: LayerAction) => {
    if (!selected) return;
    switch (action) {
      case "duplicate":
        return duplicateLayer(selected.id);
      case "delete":
        return removeLayer(selected.id);
      case "front":
        return toEdge(selected.id, "front");
      case "back":
        return toEdge(selected.id, "back");
      case "crop":
        return startCrop();
      case "redraw":
        setRedrawError(null);
        return setRedrawFor(selected);
      case "outpaint":
        setOutpaintError(null);
        return setOutpaintFor(selected);
      case "removeBg":
        return void removeBg(selected);
      case "compare":
        return setCompareFor(selected);
      case "revert":
        if (selected.previousSrc) patchLayer(selected.id, revertPatch(selected), true);
        return;
    }
  };

  /* ---- 標記 ---- */
  const startAnnotating = () => {
    setSelectedId(null);
    setMode("annotate");
  };
  const confirmAnnotation = () => {
    const c = annotateCanvasRef.current;
    if (!c) return;
    snapshot();
    setLayers((cur) => [
      ...cur.filter((l) => l.name !== ANNOTATION_LAYER_NAME),
      { id: newLayerId(), kind: "image", src: c.toDataURL("image/png"), name: ANNOTATION_LAYER_NAME, x: 0, y: 0, width: canvas.width, height: canvas.height, rotation: 0, visible: true },
    ]);
    setMode("select");
  };

  /* ---- keyboard ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) return void (e.preventDefault(), undo());
      if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) return void (e.preventDefault(), redo());
      if (mod && e.key.toLowerCase() === "d" && selected) return void (e.preventDefault(), duplicateLayer(selected.id));
      if (mod && e.key.toLowerCase() === "e") return void (e.preventDefault(), setExportOpen(true));
      if (mod && (e.key === "=" || e.key === "+")) return void (e.preventDefault(), setZoom((z) => Math.min(4, z * 1.2)));
      if (mod && e.key === "-") return void (e.preventDefault(), setZoom((z) => Math.max(0.1, z / 1.2)));
      if (mod && e.key === "0") return void (e.preventDefault(), setZoom(1));
      if (mod && e.key === "1") return void (e.preventDefault(), setFitRequest((n) => n + 1));
      if (e.key === "Escape") {
        if (mode === "crop") cancelCrop();
        else if (mode === "annotate") setMode("select");
        else setSelectedId(null);
        return;
      }
      if (!selected || selected.locked || mode !== "select") return;
      if (e.key === "Delete" || e.key === "Backspace") return void (e.preventDefault(), removeLayer(selected.id));
      const step = e.shiftKey ? 10 : 1;
      const nudge: Record<string, Partial<EditorLayer>> = { ArrowLeft: { x: selected.x - step }, ArrowRight: { x: selected.x + step }, ArrowUp: { y: selected.y - step }, ArrowDown: { y: selected.y + step } };
      if (nudge[e.key]) {
        e.preventDefault();
        patchLayer(selected.id, nudge[e.key], !e.repeat);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const handoff = (asset: { id: number; src: string; name: string }, target: "image" | "video") => {
    sessionStorage.setItem(DIRECTOR3D_HANDOFF_KEY, JSON.stringify({ refs: [asset] }));
    router.push(`/studio?mode=${target}`);
  };

  const fieldCls = "rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-2 py-1 text-[11.5px] text-white focus:border-[#4a4a4a] focus:outline-none";
  const tbBtn = "rounded-lg px-2 py-1.5 text-[12px] text-[#c9c9c9] hover:bg-[#1f1f1f] disabled:opacity-30";

  return (
    <div className="flex h-full flex-col bg-[#0a0a0a]">
      {/* toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-[#1c1c1c] bg-black px-3">
        <Link href="/" className="rounded-lg p-1.5 text-[#9a9a9a] transition-colors hover:text-white" aria-label="返回">
          <IconChevronLeft className="h-4 w-4" />
        </Link>
        <span className="mr-1 text-[13px] font-medium text-white">圖層編輯</span>
        <select
          value={CANVAS_SIZES.find((s) => s.width === canvas.width && s.height === canvas.height)?.label ?? "custom"}
          onChange={(e) => {
            const s = CANVAS_SIZES.find((x) => x.label === e.target.value);
            if (!s) return;
            snapshot();
            setDoc((d) => ({ ...d, canvas: { ...d.canvas, width: s.width, height: s.height } }));
          }}
          className={`h-8 ${fieldCls}`}
          title="畫布尺寸（已放好的圖層位置不會跟著動）"
        >
          {CANVAS_SIZES.map((s) => (
            <option key={s.label} value={s.label}>
              {s.label}
            </option>
          ))}
          {!CANVAS_SIZES.some((s) => s.width === canvas.width && s.height === canvas.height) && <option value="custom">自訂 {canvas.width}×{canvas.height}</option>}
        </select>
        <input type="number" value={canvas.width} min={64} max={4096} onFocus={snapshot} onChange={(e) => setDoc((d) => ({ ...d, canvas: { ...d.canvas, width: Math.min(4096, Math.max(64, Number(e.target.value) || 64)) } }))} className={`h-8 w-[70px] ${fieldCls}`} title="寬" />
        <span className="text-[11px] text-[#6d6d6d]">×</span>
        <input type="number" value={canvas.height} min={64} max={4096} onFocus={snapshot} onChange={(e) => setDoc((d) => ({ ...d, canvas: { ...d.canvas, height: Math.min(4096, Math.max(64, Number(e.target.value) || 64)) } }))} className={`h-8 w-[70px] ${fieldCls}`} title="高" />
        <label className="ml-1 flex items-center gap-1 text-[11px] text-[#8a8a8a]" title="畫布背景">
          背景
          <input type="color" value={canvas.background === "transparent" ? "#ffffff" : canvas.background} onChange={(e) => setDoc((d) => ({ ...d, canvas: { ...d.canvas, background: e.target.value } }))} className="h-6 w-7 cursor-pointer rounded border border-[#2c2c2c] bg-[#1c1c1c]" />
          <button type="button" onClick={() => setDoc((d) => ({ ...d, canvas: { ...d.canvas, background: d.canvas.background === "transparent" ? "#ffffff" : "transparent" } }))} className={`rounded-md px-1.5 py-0.5 text-[10.5px] ${canvas.background === "transparent" ? "bg-[#233a34] text-[#7ff0cd]" : "bg-[#1f1f1f] text-[#c9c9c9]"}`}>
            透明
          </button>
        </label>

        <div className="ml-2 flex items-center gap-0.5 border-l border-[#1e1e1e] pl-2">
          <button type="button" onClick={undo} disabled={!history.length} title="上一步（Ctrl+Z）" className={tbBtn}>↶</button>
          <button type="button" onClick={redo} disabled={!future.length} title="重做（Ctrl+Y）" className={tbBtn}>↷</button>
        </div>
        <div className="flex items-center gap-0.5 border-l border-[#1e1e1e] pl-2">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.1, z / 1.2))} title="縮小（Ctrl+-）" className={tbBtn}>−</button>
          <button type="button" onClick={() => setZoom(1)} title="100%（Ctrl+0）" className={`${tbBtn} w-[52px] text-center tabular-nums`}>
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" onClick={() => setZoom((z) => Math.min(4, z * 1.2))} title="放大（Ctrl+=）" className={tbBtn}>＋</button>
          <button type="button" onClick={() => setFitRequest((n) => n + 1)} title="縮放到整張畫布剛好看得到（Ctrl+1）" className={tbBtn}>適合</button>
        </div>

        <button
          type="button"
          onClick={mode === "annotate" ? () => setMode("select") : startAnnotating}
          disabled={!layers.length && mode !== "annotate"}
          title="在畫面上圈出想修改的地方，生成時會一起參考"
          className={`ml-2 rounded-lg px-2.5 py-1.5 text-[12px] disabled:opacity-30 ${mode === "annotate" ? "bg-[#3a1a1a] text-[#ff9b9b]" : "bg-[#1f1f1f] text-[#c9c9c9] hover:bg-[#282828]"}`}
        >
          🖍 {mode === "annotate" ? "標記中…" : "圈出要修正的地方"}
        </button>
        <button type="button" onClick={() => setExportOpen(true)} disabled={!layers.length} title="匯出 / 存到資產庫 / 送去生成（Ctrl+E）" className="ml-auto rounded-lg bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-3 py-1.5 text-[12px] font-medium text-[#0a1a16] hover:brightness-105 disabled:opacity-40">
          ⬇ 匯出 / 送出
        </button>
      </div>

      {(error || notice) && (
        <div className={`flex items-center gap-2 border-b border-[#1c1c1c] px-4 py-1.5 text-[11.5px] ${error ? "bg-[#1a0f0f] text-[#ff9b9b]" : "bg-[#0f1a16] text-[#7ff0cd]"}`}>
          <span className="min-w-0 flex-1 truncate">{error ?? notice}</span>
          <button type="button" onClick={() => { setError(null); setNotice(null); }} aria-label="關閉訊息" className="opacity-70 hover:opacity-100">
            <IconClose className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* left: projects + sources + layers */}
        <div className="flex w-[240px] shrink-0 flex-col gap-2 overflow-y-auto border-r border-[#1c1c1c] p-3">
          <ProjectsPanel
            projects={projects}
            currentId={projectId}
            currentName={projectName}
            saveState={!signedIn ? "local" : saveStatus === "saving" ? "saving" : saveStatus === "error" ? "error" : saved.doc === doc && saved.name === projectName ? "saved" : doc.layers.length || projectId !== null ? "dirty" : "saved"}
            versions={versions}
            onOpen={openProject}
            onNew={newProject}
            onRename={setProjectName}
            onDelete={deleteProject}
            onSaveVersion={(label) => void saveVersion(label || "手動存檔")}
            onRestoreVersion={restoreVersion}
          />
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-[#3a3a3a] bg-[#161616] py-2 text-[12px] text-[#c9c9c9] hover:border-[#555]">
              <IconPlus className="h-3.5 w-3.5" />
              上傳
            </button>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) void handleUpload(e.target.files); e.target.value = ""; }} />
            <button type="button" onClick={() => { ensureAssets(); setAssetPickerOpen((v) => !v); }} className="rounded-lg bg-[#1f1f1f] px-2 py-2 text-[12px] text-[#c9c9c9] hover:bg-[#282828]">
              從資產庫選
            </button>
            <button type="button" onClick={addText} className="col-span-2 rounded-lg bg-[#1f1f1f] px-2 py-1.5 text-[12px] text-[#c9c9c9] hover:bg-[#282828]">
              T 新增文字圖層
            </button>
          </div>
          {assetPickerOpen && (
            <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10.5px] text-[#8a8a8a]">選一張加入畫布</span>
                <button type="button" onClick={() => setAssetPickerOpen(false)} className="text-[#8a8a8a] hover:text-white">
                  <IconClose className="h-3 w-3" />
                </button>
              </div>
              <div className="grid max-h-[160px] grid-cols-3 gap-1.5 overflow-y-auto">
                {assetLibrary === null && <span className="col-span-3 py-2 text-center text-[10.5px] text-[#6d6d6d]">載入中…</span>}
                {assetLibrary?.length === 0 && <span className="col-span-3 py-2 text-center text-[10.5px] text-[#6d6d6d]">資產庫還沒有圖片</span>}
                {assetLibrary?.map((a) => (
                  <button key={a.id} type="button" title={a.name} onClick={() => void addImageLayer(a.src, a.name)} className="aspect-square overflow-hidden rounded-md border border-[#2a2a2a] hover:border-[#4a4a4a]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.src} alt={a.name} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-1 flex items-center justify-between border-t border-[#1e1e1e] pt-2 text-[11px] text-[#8a8a8a]">
            <span>圖層（上 = 前）</span>
            <span className="text-[9.5px] text-[#5c5c5c]">{Math.round(docBytes(doc) / 1024)} KB</span>
          </div>
          <LayerList layers={layers} selectedId={selectedId} onSelect={setSelectedId} onPatch={patchLayer} onMove={moveLayer} onReorder={reorderLayer} onDuplicate={duplicateLayer} onRemove={removeLayer} />
        </div>

        <CanvasStage
          doc={doc}
          selectedId={selectedId}
          zoom={zoom}
          mode={mode}
          cropDraft={cropDraft}
          annotateCanvasRef={annotateCanvasRef}
          onSelect={setSelectedId}
          onSnapshot={snapshot}
          onPatch={(id, patch) => patchLayer(id, patch)}
          onCropDraft={setCropDraft}
          onZoom={setZoom}
          onDropFiles={(files) => void handleUpload(files)}
          fitRequest={fitRequest}
        />

        {/* right: properties + AI */}
        <div className="flex w-[290px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-[#1c1c1c] p-3">
          {mode === "annotate" ? (
            <div className="space-y-2">
              <div className="text-[11px] text-[#8a8a8a]">在畫面上圈出想修改的地方</div>
              <p className="text-[10.5px] leading-relaxed text-[#6d6d6d]">
                用滑鼠在畫布上塗畫，紅色標記會變成一個圖層跟畫面一起送給模型，之後在下面 prompt 裡描述「紅圈的地方想改成什麼」——模型看得到這個標記，但不保證完全照著範圍修改。想要精準控制範圍，請用圖層的「局部重繪」。
              </p>
              <button type="button" onClick={() => annotateCanvasRef.current?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height)} className="w-full rounded-lg bg-[#1f1f1f] px-3 py-1.5 text-[12px] text-[#c9c9c9] hover:bg-[#282828]">
                清除塗畫
              </button>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setMode("select")} className="flex-1 rounded-lg bg-[#1f1f1f] px-3 py-1.5 text-[12px] text-[#c9c9c9] hover:bg-[#282828]">取消</button>
                <button type="button" onClick={confirmAnnotation} className="flex-1 rounded-lg bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-3 py-1.5 text-[12px] font-medium text-[#0a1a16] hover:brightness-105">完成標記</button>
              </div>
            </div>
          ) : mode === "crop" && selected ? (
            <div className="space-y-2">
              <div className="text-[11px] text-[#8a8a8a]">裁切：{selected.name}</div>
              <p className="text-[10.5px] leading-relaxed text-[#6d6d6d]">拖曳金色框選要保留的範圍（Shift 鎖定比例）。裁切是非破壞的——之後再裁一次可以拿回被裁掉的部分。</p>
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => selected.crop && patchLayer(selected.id, { crop: undefined, ...(() => { const c = selected.crop!; const fw = selected.width / c.w; const fh = selected.height / c.h; return { x: selected.x - c.x * fw, y: selected.y - c.y * fh, width: fw, height: fh }; })() }, true)} disabled={!selected.crop} className="col-span-2 rounded-lg bg-[#1f1f1f] px-3 py-1.5 text-[12px] text-[#c9c9c9] hover:bg-[#282828] disabled:opacity-40">
                  還原成未裁切
                </button>
                <button type="button" onClick={cancelCrop} className="rounded-lg bg-[#1f1f1f] px-3 py-1.5 text-[12px] text-[#c9c9c9] hover:bg-[#282828]">取消</button>
                <button type="button" onClick={confirmCrop} className="rounded-lg bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-3 py-1.5 text-[12px] font-medium text-[#0a1a16] hover:brightness-105">套用裁切</button>
              </div>
            </div>
          ) : selected ? (
            <PropertiesPanel layer={selected} canvas={canvas} busy={busy} onPatch={(patch, s) => patchLayer(selected.id, patch, s)} onSnapshot={snapshot} onAction={onAction} />
          ) : (
            <div className="space-y-2 text-[11.5px] text-[#6d6d6d]">
              <p>選一個圖層來調整位置、大小、旋轉、不透明度、混合模式、色彩，或使用裁切／去背／局部重繪／擴圖。</p>
              <p className="text-[10.5px] leading-relaxed">
                快捷鍵：拖曳移動、Shift+拉角鎖定比例、方向鍵微調（Shift = 10px）、Ctrl+D 複製、Delete 刪除、Ctrl+滾輪縮放、空白鍵+拖曳平移、Ctrl+E 匯出。拖曳時會自動吸附畫布中心與其他圖層邊緣（按住 Alt 關閉）。
              </p>
            </div>
          )}

          <div className="border-t border-[#1e1e1e] pt-3">
            <div className="mb-1.5 text-[11px] text-[#8a8a8a]">AI 生成 / 融合</div>
            {hasAnnotation && <p className="mb-1.5 text-[10.5px] leading-relaxed text-[#ff9b9b]">畫面上有紅色標記——記得在下面描述「紅圈的地方想改成什麼」。</p>}
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="描述想生成的畫面（會把目前畫布上的排版當參考）" rows={4} className="w-full resize-none rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-2.5 py-1.5 text-[12px] text-white focus:border-[#4a4a4a] focus:outline-none" />
            <button type="button" onClick={generate} disabled={generating || !prompt.trim()} className="mt-1.5 w-full rounded-lg bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-3 py-2 text-[12.5px] font-medium text-[#0a1a16] hover:brightness-105 disabled:opacity-50">
              {generating ? "生成中…" : "生成新圖層"}
            </button>
            <p className="mt-1.5 text-[10px] leading-relaxed text-[#6d6d6d]">固定使用 Seedream 5.0 pro。畫布上的排版是給 AI 的參考構圖，不是像素級合成；生成前會自動存一個版本。</p>
          </div>
        </div>
      </div>

      {redrawFor && <MaskPainter imageSrc={redrawFor.src} onCancel={() => setRedrawFor(null)} onSubmit={(regions) => void submitRedraw(regions)} submitting={busy === "redraw"} errorMessage={redrawError} />}
      {outpaintFor && <OutpaintDialog layer={outpaintFor} onCancel={() => setOutpaintFor(null)} onSubmit={(m, p) => void submitOutpaint(m, p)} submitting={busy === "outpaint"} errorMessage={outpaintError} />}
      {compareFor && compareFor.previousSrc && (
        <CompareModal
          before={compareFor.previousSrc}
          after={compareFor.src}
          onClose={() => setCompareFor(null)}
          onRevert={() => {
            patchLayer(compareFor.id, revertPatch(compareFor), true);
            setCompareFor(null);
          }}
        />
      )}
      {exportOpen && <ExportDialog doc={doc} skipIds={annotationIds} onClose={() => setExportOpen(false)} onHandoff={handoff} />}
    </div>
  );
}
