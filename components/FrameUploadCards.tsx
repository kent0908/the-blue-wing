"use client";

import { useEffect, useRef, useState } from 'react';
import { FrameSlots, type FrameAsset, type FrameSlot, type FrameSnapshot } from '@/lib/frameSlots';
import styles from './FrameUploadCards.module.css';
import { useTr } from "@/lib/i18n/client";
import { k } from "@/lib/i18n/tr";

const labels = [k('首幀'), k('尾幀')] as const;
const isAsset = (value: unknown): value is FrameAsset => Boolean(value) && typeof value === 'object'
  && Number.isSafeInteger((value as FrameAsset).id) && (value as FrameAsset).id > 0
  && typeof (value as FrameAsset).src === 'string' && typeof (value as FrameAsset).name === 'string';

export default function FrameUploadCards({ onChange, disabled = false }: { onChange: (state: FrameSnapshot) => void; disabled?: boolean }) {
  const tr = useTr();
  const controller = useRef(new FrameSlots());
  const [state, setState] = useState<FrameSnapshot>({ slots: [null, null], uploading: [false, false] });
  const [errors, setErrors] = useState<[string, string]>(['', '']);
  const [picker, setPicker] = useState<{ slot: FrameSlot; revision: number } | null>(null);
  const [library, setLibrary] = useState<FrameAsset[] | null>(null);
  const [libraryError, setLibraryError] = useState('');
  const inputs = useRef<[HTMLInputElement | null, HTMLInputElement | null]>([null, null]);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => { const current = controller.current; current.activate(); return () => current.dispose(); }, []);
  const publish = () => { const next = controller.current.snapshot(); setState(next); onChange(next); };
  const errorAt = (slot: FrameSlot, message: string) => setErrors(previous => { const next: [string, string] = [...previous]; next[slot] = message; return next; });
  const select = (slot: FrameSlot, asset: FrameAsset | null) => { controller.current.select(slot, asset); errorAt(slot, ''); publish(); };

  async function upload(slot: FrameSlot, file: File) {
    const revision = controller.current.begin(slot); errorAt(slot, ''); publish();
    try {
      const body = new FormData(); body.append('file', file);
      const response = await fetch('/api/assets', { method: 'POST', body });
      const data = await response.json().catch(() => null);
      if (!response.ok || !isAsset(data?.asset)) throw new Error(data?.error?.message || tr("圖片上傳失敗，請稍後再試。"));
      if (controller.current.finish(slot, revision, data.asset)) { publish(); setLibrary(previous => previous ? [data.asset, ...previous.filter(a => a.id !== data.asset.id)] : [data.asset]); }
    } catch (error) {
      if (controller.current.finish(slot, revision)) { errorAt(slot, error instanceof Error ? error.message : tr("圖片上傳失敗")); publish(); }
    }
  }

  useEffect(() => {
    if (!picker) return;
    let alive = true;
    setTimeout(() => { if (alive) dialog.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, 0);
    fetch('/api/assets').then(async response => {
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.assets)) throw new Error(tr("暫時無法載入素材庫，請關閉後重試。"));
      if (alive) setLibrary(data.assets.filter((a: unknown) => isAsset(a) && (!a.contentType || a.contentType.startsWith('image/'))));
    }).catch(error => { if (alive) setLibraryError(error instanceof Error ? error.message : tr("載入失敗")); });
    return () => { alive = false; };
  }, [picker]);

  const closePicker = () => setPicker(null);
  return <section className={styles.section} aria-label={tr("首尾幀素材")}>
    <div className={styles.heading}><span>{tr("分別選擇開始與結束的畫面")}</span><button type="button" disabled={disabled || state.uploading.some(Boolean) || !state.slots.some(Boolean)} onClick={() => { controller.current.swap(); setErrors(['', '']); closePicker(); publish(); }}>{tr("交換首尾 ↔")}</button></div>
    <div className={styles.grid}>{([0, 1] as FrameSlot[]).map(slot => <article key={slot} className={styles.card} aria-label={tr("{f}上傳卡片", { f: tr(labels[slot]) })}>
      <div className={tr(styles.title)}><strong>{tr(labels[slot])}<span> · {slot === 0 ? tr("開始畫面") : tr("結束畫面")}</span></strong>{(state.slots[slot] || state.uploading[slot]) && <button type="button" className={styles.remove} disabled={disabled} aria-label={`移除${labels[slot]}`} onClick={() => select(slot, null)}>×</button>}</div>
      <div className={styles.preview}>{state.slots[slot] ? <>
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated asset preview */}
        <img src={state.slots[slot]!.src} alt={tr("{f}預覽：{name}", { f: tr(labels[slot]), name: state.slots[slot]!.name })} />
      </> : <div className={tr(styles.placeholder)}><span aria-hidden="true">＋</span><span>{state.uploading[slot] ? tr("上傳中…") : tr("加入{f}圖片", { f: tr(labels[slot]) })}</span></div>}</div>
      <div className={tr(styles.name)} role="status">{state.uploading[slot] ? tr("上傳中，可移除取消選用") : state.slots[slot]?.name || tr("尚未選擇")}</div>
      <div className={styles.actions}><button type="button" disabled={disabled} onClick={() => inputs.current[slot]?.click()}>{state.slots[slot] ? tr("替換上傳") : tr("本機上傳")}</button><button type="button" disabled={disabled} onClick={() => { const revision = controller.current.begin(slot); controller.current.finish(slot, revision); publish(); setLibraryError(''); setPicker({ slot, revision }); }}>{tr("素材庫")}</button></div>
      <input ref={node => { inputs.current[slot] = node; }} type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label={tr("上傳{f}圖片", { f: tr(labels[slot]) })} hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(slot, file); }} />
      {errors[slot] && <p className={styles.error} role="alert">{errors[slot]}</p>}
    </article>)}</div>
    <p className={tr(styles.hint)}>{tr("兩張圖片都選好後即可生成；影片會從首幀過渡至尾幀。")}</p>
    {picker && <div className={styles.backdrop} onClick={event => { if (event.target === event.currentTarget) closePicker(); }}>
      <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-label={tr("選擇{f}素材", { f: tr(labels[picker.slot]) })} onKeyDown={event => {
        if (event.key === 'Escape') closePicker();
        if (event.key === 'Tab') { const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]; const first = buttons[0], last = buttons.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
      }}>
        <div className={styles.heading}><strong>{tr("選擇")}{labels[picker.slot]}{tr("素材")}</strong><button type="button" onClick={closePicker}>{tr("關閉")}</button></div>
        {libraryError && <p role="alert" className={styles.error}>{libraryError}</p>}
        {library === null && !libraryError && <p className={tr(styles.hint)}>{tr("載入中…")}</p>}
        {library?.length === 0 && <p className={tr(styles.hint)}>{tr("素材庫還沒有圖片，請先使用本機上傳。")}</p>}
        <div className={styles.library}>{library?.map(asset => <button type="button" key={asset.id} onClick={() => { if (controller.current.current(picker.slot, picker.revision)) select(picker.slot, asset); closePicker(); }} title={tr(asset.name)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated asset preview */}
          <img src={asset.src} alt="" /><span>{tr(asset.name)}</span>
        </button>)}</div>
      </div>
    </div>}
  </section>;
}
