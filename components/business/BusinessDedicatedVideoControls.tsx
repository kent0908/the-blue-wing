"use client";

import { useId, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { BusinessDedicatedVideoCapability, BusinessDedicatedVideoMode } from "@/lib/businessDedicatedVideo";
import { useLocale } from "@/lib/i18n/client";
import { businessDedicatedVideoCopy, type BusinessDedicatedVideoCopy } from "@/lib/i18n/businessDedicatedVideo";
import { businessOperationsCopy } from "@/lib/i18n/businessOperations";
import type { BusinessAsset } from "./types";
import styles from "./BusinessDedicatedVideo.module.css";

export interface BusinessDedicatedVideoOptions {
  mode: BusinessDedicatedVideoMode;
  watermark: boolean;
  seed: string;
  negativePrompt: string;
  promptExtend: boolean;
}
export const DEFAULT_BUSINESS_DEDICATED_VIDEO_OPTIONS: BusinessDedicatedVideoOptions = { mode: "freestyle", watermark: false, seed: "", negativePrompt: "", promptExtend: false };
interface PersonalLibrary {
  assets: readonly BusinessAsset[];
  selectedIds: readonly number[];
  onToggle: (id: number) => void;
  loading?: boolean;
  unavailable?: boolean;
  onRetry?: () => void;
}
interface ReferenceItem {
  key: string;
  name: string;
  src?: string;
  source: "personal" | "business";
}
interface Props {
  capability: BusinessDedicatedVideoCapability;
  value: BusinessDedicatedVideoOptions;
  onChange: (value: BusinessDedicatedVideoOptions) => void;
  referenceCount?: number;
  disabled?: boolean;
  onOpenAssets?: () => void;
  personalLibrary?: PersonalLibrary;
  referenceItems?: readonly ReferenceItem[];
  onRemoveReference?: (key: string) => void;
  onMoveReference?: (key: string, direction: -1 | 1) => void;
}
const MODE_KEYS: Partial<Record<BusinessDedicatedVideoMode, keyof BusinessDedicatedVideoCopy>> = {
  "text-to-video": "textToVideo", "image-to-video": "imageToVideo", "first-last-frame": "firstLastFrame", "subject-reference": "subjectReference",
};
const interpolate = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
const FALLBACK_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

function PersonalImagePicker({ library, copy, capacity, acceptedTypes, maxBytes, switchToReference, disabled }: {
  library: PersonalLibrary;
  copy: BusinessDedicatedVideoCopy;
  capacity: boolean;
  acceptedTypes: readonly string[];
  maxBytes: number;
  switchToReference: boolean;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const images = library.assets.filter(asset => acceptedTypes.includes(asset.contentType ?? "image/png"));
  const term = query.trim().toLocaleLowerCase();
  const visible = term ? images.filter(asset => asset.name.toLocaleLowerCase().includes(term)) : images;

  return <details className={styles.personal}>
    <summary>{copy.personalLibrary}</summary>
    <div className={styles.personalBody}>
      {switchToReference ? <p className={styles.note}>{copy.personalSwitchMode}</p> : null}
      {images.length > 0 ? <label className={styles.field}>{copy.searchPersonal}
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} />
      </label> : null}
      {library.loading ? <p className={styles.note} role="status">{copy.personalLoading}</p> : null}
      {library.unavailable ? <p className={styles.warning} role="alert">{copy.personalUnavailable}</p> : null}
      {!library.loading && !library.unavailable && visible.length === 0 ? <p className={styles.note}>{images.length ? copy.personalNoResults : copy.personalEmpty}</p> : null}
      {visible.length > 0 ? <div className={styles.personalGrid}>{visible.map(asset => {
        const chosen = library.selectedIds.includes(asset.id);
        const tooLarge = Number(asset.size) > maxBytes;
        const locked = disabled || !chosen && (capacity || tooLarge);
        const hint = tooLarge ? copy.personalTooLarge : !chosen && capacity ? copy.referenceCapacity : asset.name;
        return <button type="button" key={asset.id} className={styles.personalAsset} aria-pressed={chosen} disabled={locked}
          title={hint} onClick={() => { if (!locked) library.onToggle(asset.id); }}>
          <Image src={`/api/assets/${asset.id}/raw`} alt="" width={160} height={96} unoptimized loading="lazy" />
          <span className={styles.assetName}>{asset.name}</span>
          {tooLarge ? <small className={styles.sizeWarning}>{copy.personalTooLarge}</small> : null}
          {chosen ? <span className={styles.assetCheck} aria-hidden="true">✓</span> : null}
        </button>;
      })}</div> : null}
      {capacity ? <p className={styles.note}>{copy.referenceCapacity}</p> : null}
      <div className={styles.libraryActions}>
        {library.onRetry ? <button type="button" disabled={library.loading} onClick={library.onRetry}>{copy.refreshPersonal}</button> : null}
        <Link className={styles.docs} href="/assets" target="_blank" rel="noopener">{copy.managePersonal} ↗</Link>
      </div>
    </div>
  </details>;
}

export function BusinessWan3DurationSelect({ capability, seconds, disabled, onChange }: {
  capability: BusinessDedicatedVideoCapability;
  seconds: number;
  disabled?: boolean;
  onChange: (seconds: number) => void;
}) {
  const t = businessDedicatedVideoCopy(useLocale());
  return <select value={seconds} disabled={disabled} onChange={event => onChange(Number(event.target.value))}>
    <option value={-1}>{t.durationAuto}</option>
    {Array.from({ length: capability.maxSeconds - capability.minSeconds + 1 }, (_, index) => capability.minSeconds + index)
      .map(value => <option key={value} value={value}>{interpolate(t.durationSeconds, { value })}</option>)}
  </select>;
}

/** Owns no submission, asset read or network call. The parent keeps the existing
 * private asset picker and resets references when the creation mode changes.
 * This first UI surface intentionally does not advertise edit/continuation.
 */
export default function BusinessDedicatedVideoControls({ capability, value, onChange, referenceCount = 0, disabled = false, onOpenAssets, personalLibrary, referenceItems, onRemoveReference, onMoveReference }: Props) {
  const locale = useLocale();
  const t = businessDedicatedVideoCopy(locale);
  const wan22 = capability.family === "wan2.2";
  const id = useId();
  const wan27 = capability.family === "wan2.7";
  const wan3 = capability.family === "wan3.0";
  const modes = capability.modes.filter(mode => MODE_KEYS[mode] !== undefined);
  const mode = value.mode === "freestyle" ? capability.capability : value.mode;
  const maximum = mode === "text-to-video" ? 0 : mode === "image-to-video" ? 1 : mode === "first-last-frame" ? 2 : capability.maxReferenceImages;
  const selectedCount = referenceItems?.length ?? referenceCount;
  const switchToReference = wan3 && mode === "text-to-video" && capability.modes.includes("subject-reference");
  const showPersonal = personalLibrary && (wan3 || wan22 || wan27) && (maximum > 0 || switchToReference);
  const personalLimit = switchToReference ? capability.maxReferenceImages : maximum;
  const description = mode === "first-last-frame" ? t.framesInfo : mode === "image-to-video" ? t.imageInfo : mode === "subject-reference" ? t.referenceInfo : t.textInfo;
  const update = (patch: Partial<BusinessDedicatedVideoOptions>) => { if (!disabled) onChange({ ...value, ...patch }); };
  // An unsupported capability has no active controls. Keep it out of the
  // ordinary generation UI until its required source-video picker is wired.
  if (!modes.length || !MODE_KEYS[mode]) return null;

  return <fieldset className={styles.controls} disabled={disabled}>
    <legend>{t.title}</legend>
    {modes.length > 1 ? <label className={styles.field} htmlFor={`${id}-mode`}>
      {t.mode}
      <select id={`${id}-mode`} value={mode} onChange={event => update({ mode: event.target.value as BusinessDedicatedVideoMode })} aria-describedby={`${id}-mode-info`}>
        {modes.map(option => <option key={option} value={option}>{t[MODE_KEYS[option]!]}</option>)}
      </select>
    </label> : <p className={styles.mode}>{t[MODE_KEYS[mode]!]}</p>}
    <p id={`${id}-mode-info`} className={styles.note}>{description}</p>
    {capability.aspectRatioFromSource ? <p className={styles.note}>{t.sourceRatio}</p> : null}
    {maximum > 0 || showPersonal ? <div className={styles.references}>
      {maximum > 0 ? <span className={styles.count} role="status">{interpolate(t.selected, { count: selectedCount, max: maximum })}</span> : null}
      {referenceItems?.length ? <ol className={styles.referenceOrder} aria-label={t.imageOrder}>{referenceItems.map((item, index) => {
        const label = mode === "image-to-video" || mode === "first-last-frame" && index === 0
          ? t.openingFrame
          : mode === "first-last-frame" && index === 1 ? t.closingFrame : interpolate(t.referenceNumber, { index: index + 1 });
        return <li key={item.key} className={styles.referenceItem}>
          {item.src ? <Image src={item.src} alt="" width={48} height={48} unoptimized /> : null}
          <div className={styles.referenceIdentity}><strong>{label}</strong><span>{item.name}</span><small>{item.source === "personal" ? t.personalSource : t.businessSource}</small></div>
          <div className={styles.referenceActions}>
            {onMoveReference && referenceItems.length > 1 ? <>
              <button type="button" aria-label={interpolate(t.moveEarlier, { name: item.name })} disabled={disabled || index === 0} onClick={() => onMoveReference(item.key, -1)}>↑</button>
              <button type="button" aria-label={interpolate(t.moveLater, { name: item.name })} disabled={disabled || index === referenceItems.length - 1} onClick={() => onMoveReference(item.key, 1)}>↓</button>
            </> : null}
            {onRemoveReference ? <button type="button" aria-label={interpolate(t.removeImage, { name: item.name })} disabled={disabled} onClick={() => onRemoveReference(item.key)}>×</button> : null}
          </div>
        </li>;
      })}</ol> : null}
      {showPersonal ? <PersonalImagePicker library={personalLibrary} copy={t} capacity={selectedCount >= personalLimit}
        acceptedTypes={capability.referenceImageRules?.mimeTypes ?? FALLBACK_IMAGE_TYPES} maxBytes={capability.referenceImageRules?.maxBytes ?? 20 * 1024 * 1024}
        switchToReference={switchToReference} disabled={disabled} /> : null}
      {maximum > 0 ? <>
        {onOpenAssets ? <button type="button" onClick={onOpenAssets}>{t.openAssets}</button> : null}
        {selectedCount > maximum ? <p role="alert" className={styles.warning}>{t.referenceLimit}</p> : null}
        <p className={styles.note}>{t.assetsNote}</p>
        {wan3 || wan22 ? <p className={styles.note}>{t.wan3ImageRules}</p> : !wan27 ? <p className={styles.note}>{t.happyRules}</p> : null}
        {!wan27 && mode === "subject-reference" ? <p className={styles.note}>{wan3 ? t.wan3ReferenceInfo : t.happyReferenceInfo}</p> : null}
      </> : null}
    </div> : null}
    <details className={styles.advanced}>
      <summary>{t.advanced}</summary>
      <div className={styles.body}>
        {!wan3 && !wan22 ? <>
          <label className={styles.check}><input type="checkbox" checked={value.watermark} onChange={event => update({ watermark: event.target.checked })} aria-describedby={`${id}-watermark-info`} /><span>{t.watermark}</span></label>
          <p id={`${id}-watermark-info`} className={styles.note}>{t.watermarkInfo}</p>
        </> : null}
        <label className={styles.field} htmlFor={`${id}-seed`}>{t.seed}<input id={`${id}-seed`} type="text" inputMode="numeric" autoComplete="off" value={value.seed} onChange={event => update({ seed: event.target.value })} placeholder={t.seedPlaceholder} aria-describedby={`${id}-seed-info`} /></label>
        <p id={`${id}-seed-info`} className={styles.note}>{wan3 || wan22 ? t.wan3Seed : wan27 ? t.seedWan : t.seedHappy}</p>
        {wan22 || wan27 || wan3 ? <>
          <label className={styles.check}><input type="checkbox" checked={value.promptExtend} onChange={event => update({ promptExtend: event.target.checked })} aria-describedby={`${id}-extend-info`} /><span>{t.promptExtend}</span></label>
          <p id={`${id}-extend-info`} className={styles.note}>{capability.promptExtendSurcharged ? businessOperationsCopy(locale).promptRewriteSurcharge : t.promptExtendInfo}</p>
          {wan27 ? <>
            <label className={styles.field} htmlFor={`${id}-negative`}>{t.negative}<textarea id={`${id}-negative`} value={value.negativePrompt} maxLength={4000} onChange={event => update({ negativePrompt: event.target.value })} placeholder={t.negativePlaceholder} aria-describedby={`${id}-negative-count`} /></label>
            <span id={`${id}-negative-count`} className={styles.note}>{interpolate(t.negativeCount, { count: value.negativePrompt.length })}</span>
          </> : null}
        </> : null}
      </div>
    </details>
    <a className={styles.docs} href={`https://docs.siraya.ai/docs/api-reference/generative-model-api/${wan22 || wan27 && capability.capability === "image-to-video" ? "image-to-video" : "text-to-video"}/${wan22 || wan27 || wan3 ? "wan" : "happyhorse"}/`} target="_blank" rel="noreferrer">{t.providerDocs} ↗</a>
  </fieldset>;
}
