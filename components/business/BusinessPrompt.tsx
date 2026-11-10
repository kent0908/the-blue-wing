"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { useLocale } from "@/lib/i18n/client";
import { businessMentionsCopy } from "@/lib/i18n/businessMentions";
import type { BusinessAsset } from "./types";
import type { BusinessAssetRecord } from "./BusinessAssets";
import styles from "./Business.module.css";
import picker from "./BusinessPrompt.module.css";

export interface MentionCandidate {
  key: string;
  name: string;
  src?: string;
  localId?: number;
  personalAsset?: BusinessAsset;
  asset?: BusinessAssetRecord;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  label: string;
  placeholder: string;
  note: string;
  assets: BusinessAsset[];
  mode: "none" | "local" | "image" | "seedance" | "native" | "native-with-personal";
  personalMaxBytes?: number;
  selectedKeys?: ReadonlySet<string>;
  onPick: (candidate: MentionCandidate) => string | null;
}

interface Upload {
  id: string;
  name: string;
  type: string;
  storageReady: boolean;
  status: string;
  asset?: BusinessAssetRecord;
}

interface Mention {
  start: number;
  end: number;
  query: string;
  from: "typing" | "button";
}

async function loadList<T>(url: string, key: string, signal: AbortSignal): Promise<T[]> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error("asset_list_unavailable");
  const body = await response.json();
  if (!Array.isArray(body[key])) throw new Error("invalid_asset_list");
  return body[key];
}

function listCandidates(
  mode: Props["mode"], local: BusinessAsset[], uploads: Upload[], reviewed: BusinessAssetRecord[],
  selectedKeys?: ReadonlySet<string>, personalMaxBytes?: number,
) {
  const candidates = new Map<string, MentionCandidate>();
  const seenProvider = new Set<string>();

  if (mode !== "local") {
    for (const upload of uploads) {
      if (upload.type !== "image") continue;
      const approved = mode === "seedance" && upload.asset?.status === "active" ? upload.asset : undefined;
      if (!upload.storageReady && !approved) continue;
      const uploadKey = `business:${upload.id}`;
      const useProvider = approved && !selectedKeys?.has(uploadKey);
      const key = useProvider ? `provider:${approved.id}` : uploadKey;
      if (approved) seenProvider.add(approved.id);
      candidates.set(key, {
        key, name: upload.name,
        src: upload.storageReady ? `/api/business/provider-assets/uploads/${upload.id}/preview` : undefined,
        asset: {
          ...(upload.asset ?? { id: `upload:${upload.id}`, type: "image", name: upload.name, status: upload.status }),
          uploadId: upload.id, storageReady: upload.storageReady,
        },
      });
    }
  }
  if (mode === "seedance") {
    for (const asset of reviewed) {
      if (asset.type !== "image" || asset.status !== "active" || seenProvider.has(asset.id)) continue;
      const key = `provider:${asset.id}`;
      candidates.set(key, { key, name: asset.name, asset });
    }
  }
  if (mode !== "native") {
    for (const asset of local) {
      if (!["image/png", "image/jpeg", "image/webp"].includes(asset.contentType ?? "image/png") ||
        (personalMaxBytes !== undefined && asset.size !== undefined && Number(asset.size) > personalMaxBytes)) continue;
      const key = `local:${asset.id}`;
      candidates.set(key, { key, localId: asset.id, name: asset.name, src: `/api/assets/${asset.id}/raw`, personalAsset: asset });
    }
  }
  return [...candidates.values()];
}

function findMention(value: string, caret: number): Mention | null {
  const text = value.slice(0, caret);
  const match = /[@＠]([^\s@＠，。！？、；：]*)$/u.exec(text);
  if (!match) return null;
  const before = text.slice(0, match.index);
  // Allow the marker next to CJK text while leaving addresses such as name@host alone.
  if (before && !/[\s\p{P}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(before)) return null;
  return { start: match.index, end: caret, query: match[1], from: "typing" };
}

function PictureIcon() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="9.5" r="1.5" />
    <path d="m4 17 4.5-4 3.5 3 3.5-5 4.5 6" />
  </svg>;
}

function Thumbnail({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);
  return <span className={picker.thumbnail}>
    {src && !failed
      ? <Image src={src} alt="" width={48} height={48} unoptimized loading="lazy" onError={() => setFailed(true)} />
      : <PictureIcon />}
  </span>;
}

export default function BusinessPrompt(props: Props) {
  const locale = useLocale();
  const t = businessMentionsCopy(locale);
  const id = useId();
  const listId = `${id}-list`;
  const field = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const [mention, setMention] = useState<Mention | null>(null);
  const [local, setLocal] = useState<BusinessAsset[] | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [reviewed, setReviewed] = useState<BusinessAssetRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selectionError, setSelectionError] = useState<"tooLong" | "limit" | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const { mode } = props;
  const opened = mention !== null && mode !== "none";
  const manual = mention?.from === "button";

  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    const { signal } = controller;
    async function load<T>(url: string, key: string, apply: (values: T[]) => void) {
      try {
        const values = await loadList<T>(url, key, signal);
        if (!signal.aborted) apply(values);
      } catch {
        if (!signal.aborted) setError(true);
      }
    }
    const requests = [
      mode !== "native" && load<BusinessAsset>("/api/assets", "assets", setLocal),
      mode !== "local" && load<Upload>("/api/business/provider-assets/upload", "uploads", setUploads),
      mode === "seedance" && load<BusinessAssetRecord>("/api/business/provider-assets?assetType=image&status=active&pageSize=100", "assets", setReviewed),
    ];
    void Promise.all(requests).then(() => { if (!signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [opened, mode, retry]);

  useEffect(() => {
    if (!opened) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !field.current?.contains(event.target)) setMention(null);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [opened]);

  useEffect(() => {
    if (opened && manual) search.current?.focus({ preventScroll: true });
  }, [opened, manual]);

  const query = mention?.query.trim().normalize("NFKC").toLocaleLowerCase(locale) ?? "";
  const candidates = opened ? listCandidates(mode, local ?? props.assets, uploads, reviewed, props.selectedKeys, props.personalMaxBytes) : [];
  const matches = query ? candidates.filter(candidate => candidate.name.normalize("NFKC").toLocaleLowerCase(locale).includes(query)) : candidates;
  const activeIndex = matches.findIndex(candidate => candidate.key === activeKey);
  const activeId = activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined;

  useEffect(() => {
    if (opened && activeId) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [opened, activeId]);

  function updateMention(next: Mention | null) {
    if (!opened && next) {
      setLoading(true);
      setError(false);
      setLocal(null);
      setUploads([]);
      setReviewed([]);
    }
    setMention(next);
    setActiveKey(null);
    setSelectionError(null);
  }

  function track(value: string, caret: number) {
    if (mode !== "none") updateMention(findMention(value, caret));
  }

  function close() {
    updateMention(null);
    input.current?.focus({ preventScroll: true });
  }

  function choose(candidate: MentionCandidate) {
    if (!mention) return;
    const before = props.value.slice(0, mention.start);
    const after = props.value.slice(mention.end);
    const prefix = manual && /[\p{L}\p{N}_@＠-]$/u.test(before) ? " " : "";
    const hasGap = /^[ \t]/.test(after);
    // Reserve space before onPick attaches the reference as well as allocating its tag.
    if (before.length + after.length + prefix.length + 64 > props.maxLength) { setSelectionError("tooLong"); return; }
    const tag = props.onPick(candidate);
    if (!tag) { setSelectionError("limit"); return; }
    const insertion = `${prefix}@${tag}${hasGap ? "" : " "}`;
    props.onChange(before + insertion + after);
    const caret = before.length + insertion.length + (hasGap ? 1 : 0);
    updateMention(null);
    requestAnimationFrame(() => {
      input.current?.focus({ preventScroll: true });
      input.current?.setSelectionRange(caret, caret);
    });
  }

  function handleNavigation(event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
    if (!opened || event.nativeEvent.isComposing || composing.current) return;
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key === "Enter" && (event.currentTarget === search.current || (!event.shiftKey && matches.length > 0))) {
      event.preventDefault();
      const option = matches[Math.max(activeIndex, 0)];
      if (option && !event.shiftKey) choose(option);
      return;
    }
    if (!matches.length || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
    event.preventDefault();
    const next = activeIndex < 0 ? (event.key === "ArrowDown" ? 0 : matches.length - 1)
      : (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
    setActiveKey(matches[next].key);
  }

  return <div className={styles.field} ref={field}
    onBlur={event => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) updateMention(null);
    }}
    onKeyDown={event => {
      if (opened && event.key === "Escape" && !event.defaultPrevented && !event.nativeEvent.isComposing && !composing.current) {
        event.preventDefault();
        close();
      }
    }}>
    <label htmlFor={id}>{props.label}</label>
    <textarea id={id} ref={input} required value={props.value} maxLength={props.maxLength} placeholder={props.placeholder}
      aria-describedby={`${id}-note`} aria-autocomplete={mode === "none" ? undefined : "list"}
      aria-controls={opened ? listId : undefined} aria-activedescendant={opened ? activeId : undefined}
      onChange={event => {
        props.onChange(event.target.value);
        if (!composing.current) track(event.target.value, event.target.selectionStart);
      }}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={event => { composing.current = false; track(event.currentTarget.value, event.currentTarget.selectionStart); }}
      onClick={event => track(props.value, event.currentTarget.selectionStart)} onKeyDown={handleNavigation} />
    {mode !== "none" && <>
      <div className={picker.tools}>
        <button type="button" className={picker.trigger} aria-expanded={opened} aria-controls={opened ? listId : undefined} onClick={() => {
          if (opened && manual) { close(); return; }
          const start = input.current?.selectionStart ?? props.value.length;
          const end = input.current?.selectionEnd ?? start;
          const pending = opened && mention?.from === "typing" ? mention : { start, end, query: "" };
          updateMention({ ...pending, from: "button" });
        }}><span aria-hidden="true">@</span>{t.add}</button>
        <span className={picker.hint}>{t.hint}</span>
      </div>
      {opened && <div className={picker.panel}>
        <div className={picker.header}>
          <strong>{t.list}</strong>
          <button type="button" className={picker.close} aria-label={t.close} onClick={close}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="m4 4 8 8m0-8-8 8" /></svg>
          </button>
        </div>
        <input type="text" ref={search} className={picker.search} role="combobox" inputMode="search" autoComplete="off" maxLength={120}
          aria-label={t.search} aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-activedescendant={activeId}
          placeholder={t.search} value={mention.query} onChange={event => {
            const query = event.target.value;
            setMention(current => current ? { ...current, query } : null);
            setActiveKey(null);
            setSelectionError(null);
          }}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={handleNavigation} />
        {loading && !matches.length && <p className={picker.notice} role="status">{t.loading}</p>}
        {error && <div className={picker.status}><span role="status">{t.error}</span><button type="button" onClick={() => {
          setLoading(true); setError(false); setRetry(value => value + 1);
        }}>{t.retry}</button></div>}
        {selectionError && <p className={picker.notice} role="alert">{t[selectionError]}</p>}
        <div id={listId} className={picker.list} role="listbox" aria-label={t.list} aria-busy={loading && !matches.length}>
          {matches.map((candidate, position) => <button type="button" role="option" tabIndex={-1}
            aria-selected={position === activeIndex} id={`${id}-option-${position}`} key={candidate.key}
            className={picker.option} onMouseDown={event => event.preventDefault()} onClick={() => choose(candidate)}>
            <Thumbnail key={candidate.src} src={candidate.src} />
            <span className={picker.identity}>
              <span className={picker.name} title={candidate.name}>{candidate.name}</span>
              <small>{candidate.localId ? t.personal : candidate.key.startsWith("provider:") ? t.reviewed : t.business}</small>
            </span>
            {props.selectedKeys?.has(candidate.key)
              ? <span className={picker.selected}><span aria-hidden="true">✓</span>{t.selected}</span>
              : <span className={picker.insert} aria-hidden="true">+</span>}
          </button>)}
        </div>
        {!loading && !matches.length && (!error || candidates.length > 0) &&
          <p className={picker.notice} role="status">{candidates.length ? t.noMatches : t.empty}</p>}
      </div>}
    </>}
    <span id={`${id}-note`} className={styles.note}>{props.value.length.toLocaleString()} / {props.maxLength.toLocaleString()} · {props.note}</span>
  </div>;
}
