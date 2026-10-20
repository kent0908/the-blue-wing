"use client";

import { useLocale } from "@/lib/i18n/client";
import { businessOperationsCopy } from "@/lib/i18n/businessOperations";
import type { BusinessModel } from "./types";
import styles from "./BusinessOperations.module.css";

interface Props { model: BusinessModel; count: number; onCount: (value: number) => void; quality: string; onQuality: (value: string) => void; seed: string; onSeed: (value: string) => void; negative: string; onNegative: (value: string) => void }
export default function BusinessImageControls({ model, count, onCount, quality, onQuality, seed, onSeed, negative, onNegative }: Props) {
  const t = businessOperationsCopy(useLocale());
  return <div className={styles.imageControls}>
    <label className={styles.field}>{t.imageCount}<input type="number" min={1} max={model.maxImageCount ?? 1} value={count} step={1} required disabled={(model.maxImageCount ?? 1) === 1} onChange={e => onCount(Number(e.target.value))} /></label>
    {model.imageControls?.map(control => control.key === "quality" ? <label className={styles.field} key={control.key}>{t.quality}<select value={quality} onChange={e => onQuality(e.target.value)}><option value="">{t.automatic}</option>{control.options?.map(option => <option key={option} value={option}>{option}</option>)}</select></label> : control.key === "seed" ? <label className={styles.field} key={control.key}>{t.seed}<input type="number" step={1} min={control.min ?? -1} max={control.max ?? 2147483647} value={seed} placeholder={t.automatic} onChange={e => onSeed(e.target.value)} /></label> : <label className={`${styles.field} ${styles.wideField}`} key={control.key}>{t.negative}<input type="text" value={negative} maxLength={4000} onChange={e => onNegative(e.target.value)} /></label>)}
  </div>;
}
