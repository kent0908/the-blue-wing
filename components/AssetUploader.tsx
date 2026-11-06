"use client";

import { useEffect, useRef, useState } from "react";
import { uploadAsset, type UploadAssetOptions } from "@/lib/uploadAsset";
import { ALLOWED_ASSET_TYPES, type PublicAsset } from "@/lib/assets";
import { useLocale, useTr } from "@/lib/i18n/client";
import { assetUploadCopy } from "@/lib/i18n/assetUpload";

type Stage = Parameters<NonNullable<UploadAssetOptions["onStage"]>>[0];
type Item = { id: string; file: File; state: "queued" | "running" | "completed" | "error" | "cancelled"; stage: Stage; progress: number; updated: number; message?: string; controller: AbortController };

export default function AssetUploader({ disabled, onUploaded }: { disabled: boolean; onUploaded: (asset: PublicAsset) => void }) {
  const t = assetUploadCopy(useLocale()), tr = useTr();
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [now, setNow] = useState(0);
  const queue = useRef<Item[]>([]), running = useRef(false), alive = useRef(true);
  const input = useRef<HTMLInputElement>(null);
  const uploaded = useRef(onUploaded);
  useEffect(() => { uploaded.current = onUploaded; }, [onUploaded]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; queue.current.forEach(item => item.controller.abort()); };
  }, []);
  const busy = items.some(item => item.state === "running");
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  function publish() { if (alive.current) setItems(queue.current.map(item => ({ ...item }))); }
  async function drain() {
    if (running.current) return;
    running.current = true;
    try {
      let item: Item | undefined;
      while (alive.current && (item = queue.current.find(value => value.state === "queued"))) {
        const current = item;
        current.state = "running"; current.updated = Date.now(); publish();
        try {
          const asset = await uploadAsset(current.file, {
            signal: current.controller.signal,
            onStage: stage => { current.stage = stage; current.updated = Date.now(); publish(); },
            onProgress: fraction => { current.progress = fraction; current.updated = Date.now(); publish(); },
          });
          current.state = "completed"; current.progress = 1;
          if (alive.current) uploaded.current(asset);
        } catch (error) {
          current.state = current.controller.signal.aborted ? "cancelled" : "error";
          current.message = error instanceof Error ? error.message : "";
          if (error instanceof Error && error.name === "TimeoutError") current.message = "timeout";
        }
        publish();
      }
    } finally { running.current = false; }
  }
  function add(files: File[]) {
    if (disabled) return;
    queue.current.push(...files.map(file => ({ id: crypto.randomUUID(), file, state: "queued" as const, stage: "preparing" as const, progress: 0, updated: Date.now(), controller: new AbortController() })));
    publish(); void drain();
  }
  function retry(id: string) {
    const item = queue.current.find(value => value.id === id);
    if (!item || !["error", "cancelled"].includes(item.state)) return;
    Object.assign(item, { state: "queued", stage: "preparing", progress: 0, message: undefined, controller: new AbortController() });
    publish(); void drain();
  }
  function cancel(id: string) {
    const item = queue.current.find(value => value.id === id);
    if (!item) return;
    item.controller.abort();
    if (item.state === "queued") item.state = "cancelled";
    publish();
  }
  return <section className="mt-6 space-y-3" aria-label={t.title}>
    <h2 className="text-lg font-semibold">{t.title}</h2>
    <button type="button" disabled={disabled} onClick={() => input.current?.click()}
      onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={event => { event.preventDefault(); setDragging(false); add(Array.from(event.dataTransfer.files)); }}
      className={`w-full rounded-2xl border border-dashed px-5 py-9 text-center disabled:opacity-50 ${dragging ? "border-[#7ff0cd] bg-[#10201c]" : "border-[#555] bg-[#161b19] hover:border-[#7ff0cd]"}`}>
      <span className="block text-base text-white">↑ {disabled ? t.unavailable : t.choose}</span>
      <span className="mt-2 block text-sm text-[#b4c2bc]">{t.description}</span>
    </button>
    <input ref={input} type="file" multiple accept={Object.keys(ALLOWED_ASSET_TYPES).join(",")} className="hidden" disabled={disabled} onChange={event => { add(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
    <ul className="space-y-2">{items.map(item => {
      const active = item.state === "running", status = item.state === "running" ? t[item.stage] : t[item.state];
      return <li key={item.id} className="rounded-xl border border-[#35443d] bg-[#15201b] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1"><p className="break-all text-sm text-white">{item.file.name}</p><p className="mt-1 text-xs text-[#b4c2bc]">{(item.file.size / 1024 / 1024).toFixed(2)} MB</p></div>
          <div className="flex gap-3 text-sm">{["error", "cancelled"].includes(item.state) && <button type="button" onClick={() => retry(item.id)} className="text-[#7ff0cd]">{t.retry}</button>}{(active || item.state === "queued") && <button type="button" onClick={() => cancel(item.id)}>{t.cancel}</button>}</div>
        </div>
        <p role="status" className={`mt-2 text-sm ${item.state === "error" ? "text-[#ffb4b4]" : "text-[#7ff0cd]"}`}>{status}{active && item.stage === "uploading" ? ` · ${Math.round(item.progress * 100)}%` : ""}</p>
        {active && <progress aria-label={`${t.progress}: ${item.file.name}`} max={1} value={item.stage === "uploading" ? item.progress : undefined} className="mt-2 h-2 w-full accent-[#7ff0cd]" />}
        {active && now - item.updated > 10_000 && <p className="mt-2 text-sm text-[#c5cec9]">{t.waiting}</p>}
        {item.state === "error" && <p className="mt-2 text-sm text-[#ffb4b4]">{item.message === "timeout" ? t.timeout : tr(item.message)}</p>}
      </li>;
    })}</ul>
    {items.some(item => ["completed", "cancelled"].includes(item.state)) && <button type="button" className="text-sm text-[#b4c2bc] underline" onClick={() => { queue.current = queue.current.filter(item => !["completed", "cancelled"].includes(item.state)); publish(); }}>{t.clear}</button>}
  </section>;
}
