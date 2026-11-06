"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useLocale } from "@/lib/i18n/client";
import { businessMentionsCopy } from "@/lib/i18n/businessMentions";
import type { BusinessAsset } from "./types";
import type { BusinessAssetRecord } from "./BusinessAssets";
import styles from "./Business.module.css";

export interface MentionCandidate { key: string; name: string; src?: string; localId?: number; asset?: BusinessAssetRecord }
interface Props {
  value: string; onChange: (value: string) => void; maxLength: number; label: string; placeholder: string; note: string;
  assets: BusinessAsset[]; mode: "none" | "local" | "image" | "seedance" | "native"; onPick: (candidate: MentionCandidate) => string | null;
}
export default function BusinessPrompt(props: Props) {
  const t = businessMentionsCopy(useLocale()), id = useId(), input = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{ start: number; end: number; query: string } | null>(null);
  const [remote, setRemote] = useState<MentionCandidate[]>([]), [local, setLocal] = useState<BusinessAsset[] | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState(false), [index, setIndex] = useState(0);
  const opened = mention !== null && props.mode !== "none";
  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    const run = async () => {
      setLoading(true); setError(false);
      const results = await Promise.allSettled([
        fetch("/api/assets", { cache: "no-store", signal: controller.signal }).then(async response => { if (!response.ok) throw new Error(); return response.json(); }),
        fetch("/api/business/provider-assets/upload", { cache: "no-store", signal: controller.signal }).then(async response => { if (!response.ok) throw new Error(); return response.json(); }),
      ]);
      if (controller.signal.aborted) return;
      if (results[0].status === "fulfilled") setLocal(results[0].value.assets ?? []);
      if (results[1].status === "fulfilled") {
        const uploads = results[1].value.uploads as { id: string; name: string; type: string; storageReady: boolean; status: string; asset?: BusinessAssetRecord }[];
        setRemote((uploads ?? []).filter(item => item.type === "image" && (item.storageReady || props.mode === "seedance" && item.asset?.status === "active")).map(item => ({
          key: props.mode === "seedance" && !item.storageReady ? `provider:${item.asset!.id}` : `business:${item.id}`, name: item.name,
          src: item.storageReady ? `/api/business/provider-assets/uploads/${item.id}/preview` : undefined,
          asset: { ...(item.asset ?? { id: `upload:${item.id}`, type: "image", name: item.name, status: item.status }), uploadId: item.id, storageReady: item.storageReady },
        })));
      } else { setRemote([]); if (props.mode !== "local") setError(true); }
      if (results[0].status === "rejected" && props.mode === "local") setError(true);
      setLoading(false);
    };
    void run(); return () => controller.abort();
  }, [opened, props.mode]);
  const candidates: MentionCandidate[] = [
    ...(props.mode === "native" ? [] : (local ?? props.assets).filter(asset => ["image/png", "image/jpeg", "image/webp"].includes(asset.contentType ?? "image/png")).map(asset => ({ key: `local:${asset.id}`, localId: asset.id, name: asset.name, src: `/api/assets/${asset.id}/raw` }))),
    ...(props.mode === "local" ? [] : remote),
  ];
  const matches = candidates.filter(candidate => candidate.name.toLocaleLowerCase().includes(mention?.query.toLocaleLowerCase() ?? ""));
  function track(value: string, caret: number) {
    const match = /(?:^|\s)@([^\s@]*)$/.exec(value.slice(0, caret));
    setMention(match ? { start: caret - match[1].length - 1, end: caret, query: match[1] } : null); setIndex(0);
  }
  function choose(candidate: MentionCandidate) {
    if (!mention) return;
    // Reserve enough editor space before attaching a reference.
    if (props.value.length - (mention.end - mention.start) + 64 > props.maxLength) return;
    const tag = props.onPick(candidate); if (!tag) return;
    const insertion = `@${tag} `;
    props.onChange(props.value.slice(0, mention.start) + insertion + props.value.slice(mention.end));
    const caret = mention.start + insertion.length;
    setMention(null);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(caret, caret); });
  }
  return <div className={styles.field}>
    <label htmlFor={id}>{props.label}</label>
    <textarea id={id} ref={input} required value={props.value} maxLength={props.maxLength} placeholder={props.placeholder} aria-describedby={`${id}-note`} aria-controls={opened ? `${id}-list` : undefined} aria-activedescendant={opened && matches[index] ? `${id}-option-${index}` : undefined}
      style={{ minHeight: 190 }} onChange={event => { props.onChange(event.target.value); track(event.target.value, event.target.selectionStart); }} onClick={event => track(props.value, event.currentTarget.selectionStart)}
      onKeyDown={event => {
        if (!opened || event.nativeEvent.isComposing) return;
        if (event.key === "Escape") { event.preventDefault(); setMention(null); }
        if (matches.length && ["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setIndex(value => (value + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length); }
        if (matches.length && event.key === "Enter") { event.preventDefault(); choose(matches[index] ?? matches[0]); }
      }} />
    {props.mode !== "none" && <><div className="flex flex-wrap items-center gap-3"><button type="button" className={styles.small} onClick={() => { const caret = input.current?.selectionStart ?? props.value.length; setMention({ start: caret, end: caret, query: "" }); setIndex(0); input.current?.focus(); }}>{t.add}</button><span className={styles.note}>{t.hint}</span></div>
      {opened && <div className="max-h-72 overflow-auto rounded-lg border border-[#486052] bg-[#101c15] p-2">
        {loading && <p role="status">{t.loading}</p>}{error && <p role="alert">{t.error}</p>}
        <div id={`${id}-list`} role="listbox" aria-label={t.list}>{matches.map((candidate, position) => <button type="button" role="option" aria-selected={position === index} id={`${id}-option-${position}`} key={candidate.key} onMouseDown={event => event.preventDefault()} onClick={() => choose(candidate)} className={`flex w-full items-center gap-3 rounded p-2 text-left ${position === index ? "bg-[#284635]" : "hover:bg-[#20372b]"}`}>
          {candidate.src && <Image src={candidate.src} alt="" width={48} height={48} unoptimized className="h-12 w-12 rounded object-cover" />}
          <span className="min-w-0 break-all">{candidate.name}<small className="block text-[#b4c2bc]">{candidate.localId ? t.personal : t.business}</small></span>
        </button>)}</div>{!loading && !matches.length && <p className={styles.note}>{t.empty}</p>}
      </div>}</>}
    <span id={`${id}-note`} className={styles.note}>{props.value.length.toLocaleString()} / {props.maxLength.toLocaleString()} · {props.note}</span>
  </div>;
}
