"use client";

import { useEffect, useRef, useState } from 'react';
import { FrameSlots, type FrameAsset, type FrameSlot, type FrameSnapshot } from '@/lib/frameSlots';
import styles from './FrameUploadCards.module.css';

const labels = ['首幀', '尾幀'] as const;
const isAsset = (value: unknown): value is FrameAsset => Boolean(value) && typeof value === 'object'
  && Number.isSafeInteger((value as FrameAsset).id) && (value as FrameAsset).id > 0
  && typeof (value as FrameAsset).src === 'string' && typeof (value as FrameAsset).name === 'string';

export default function FrameUploadCards({ onChange, disabled = false }: { onChange: (state: FrameSnapshot) => void; disabled?: boolean }) {
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
      if (!response.ok || !isAsset(data?.asset)) throw new Error(data?.error?.message || '圖片上傳失敗，請稍後再試。');
      if (controller.current.finish(slot, revision, data.asset)) { publish(); setLibrary(previous => previous ? [data.asset, ...previous.filter(a => a.id !== data.asset.id)] : [data.asset]); }
    } catch (error) {
      if (controller.current.finish(slot, revision)) { errorAt(slot, error instanceof Error ? error.message : '圖片上傳失敗'); publish(); }
    }
  }

  useEffect(() => {
    if (!picker) return;
    let alive = true;
    setTimeout(() => { if (alive) dialog.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, 0);
    fetch('/api/assets').then(async response => {
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.assets)) throw new Error('暫時無法載入素材庫，請關閉後重試。');
      if (alive) setLibrary(data.assets.filter((a: unknown) => isAsset(a) && (!a.contentType || a.contentType.startsWith('image/'))));
    }).catch(error => { if (alive) setLibraryError(error instanceof Error ? error.message : '載入失敗'); });
    return () => { alive = false; };
  }, [picker]);

  const closePicker = () => setPicker(null);
  return <section className={styles.section} aria-label="首尾幀素材">
    <div className={styles.heading}><span>分別選擇開始與結束的畫面</span><button type="button" disabled={disabled || state.uploading.some(Boolean) || !state.slots.some(Boolean)} onClick={() => { controller.current.swap(); setErrors(['', '']); closePicker(); publish(); }}>交換首尾 ↔</button></div>
    <div className={styles.grid}>{([0, 1] as FrameSlot[]).map(slot => <article key={slot} className={styles.card} aria-label={`${labels[slot]}上傳卡片`}>
      <div className={styles.title}><strong>{labels[slot]}<span> · {slot === 0 ? '開始畫面' : '結束畫面'}</span></strong>{(state.slots[slot] || state.uploading[slot]) && <button type="button" className={styles.remove} disabled={disabled} aria-label={`移除${labels[slot]}`} onClick={() => select(slot, null)}>×</button>}</div>
      <div className={styles.preview}>{state.slots[slot] ? <>
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated asset preview */}
        <img src={state.slots[slot]!.src} alt={`${labels[slot]}預覽：${state.slots[slot]!.name}`} />
      </> : <div className={styles.placeholder}><span aria-hidden="true">＋</span><span>{state.uploading[slot] ? '上傳中…' : `加入${labels[slot]}圖片`}</span></div>}</div>
      <div className={styles.name} role="status">{state.uploading[slot] ? '上傳中，可移除取消選用' : state.slots[slot]?.name || '尚未選擇'}</div>
      <div className={styles.actions}><button type="button" disabled={disabled} onClick={() => inputs.current[slot]?.click()}>{state.slots[slot] ? '替換上傳' : '本機上傳'}</button><button type="button" disabled={disabled} onClick={() => { const revision = controller.current.begin(slot); controller.current.finish(slot, revision); publish(); setLibraryError(''); setPicker({ slot, revision }); }}>素材庫</button></div>
      <input ref={node => { inputs.current[slot] = node; }} type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label={`上傳${labels[slot]}圖片`} hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(slot, file); }} />
      {errors[slot] && <p className={styles.error} role="alert">{errors[slot]}</p>}
    </article>)}</div>
    <p className={styles.hint}>兩張圖片都選好後即可生成；影片會從首幀過渡至尾幀。</p>
    {picker && <div className={styles.backdrop} onClick={event => { if (event.target === event.currentTarget) closePicker(); }}>
      <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-label={`選擇${labels[picker.slot]}素材`} onKeyDown={event => {
        if (event.key === 'Escape') closePicker();
        if (event.key === 'Tab') { const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]; const first = buttons[0], last = buttons.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
      }}>
        <div className={styles.heading}><strong>選擇{labels[picker.slot]}素材</strong><button type="button" onClick={closePicker}>關閉</button></div>
        {libraryError && <p role="alert" className={styles.error}>{libraryError}</p>}
        {library === null && !libraryError && <p className={styles.hint}>載入中…</p>}
        {library?.length === 0 && <p className={styles.hint}>素材庫還沒有圖片，請先使用本機上傳。</p>}
        <div className={styles.library}>{library?.map(asset => <button type="button" key={asset.id} onClick={() => { if (controller.current.current(picker.slot, picker.revision)) select(picker.slot, asset); closePicker(); }} title={asset.name}>
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated asset preview */}
          <img src={asset.src} alt="" /><span>{asset.name}</span>
        </button>)}</div>
      </div>
    </div>}
  </section>;
}
