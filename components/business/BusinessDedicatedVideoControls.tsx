"use client";

import { useId } from "react";
import type { BusinessDedicatedVideoCapability, BusinessDedicatedVideoMode } from "@/lib/businessDedicatedVideo";
import { useLocale } from "@/lib/i18n/client";
import { businessDedicatedVideoCopy, type BusinessDedicatedVideoCopy } from "@/lib/i18n/businessDedicatedVideo";
import styles from "./BusinessDedicatedVideo.module.css";

export interface BusinessDedicatedVideoOptions {
  mode: BusinessDedicatedVideoMode;
  watermark: boolean;
  seed: string;
  negativePrompt: string;
  promptExtend: boolean;
}
export const DEFAULT_BUSINESS_DEDICATED_VIDEO_OPTIONS: BusinessDedicatedVideoOptions = { mode: "freestyle", watermark: false, seed: "", negativePrompt: "", promptExtend: false };
interface Props {
  capability: BusinessDedicatedVideoCapability;
  value: BusinessDedicatedVideoOptions;
  onChange: (value: BusinessDedicatedVideoOptions) => void;
  referenceCount?: number;
  disabled?: boolean;
  onOpenAssets?: () => void;
}
const MODE_KEYS: Partial<Record<BusinessDedicatedVideoMode, keyof BusinessDedicatedVideoCopy>> = {
  "text-to-video": "textToVideo", "image-to-video": "imageToVideo", "first-last-frame": "firstLastFrame", "subject-reference": "subjectReference",
};
const interpolate = (text: string, values: Record<string, number>) => text.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));

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
export default function BusinessDedicatedVideoControls({ capability, value, onChange, referenceCount = 0, disabled = false, onOpenAssets }: Props) {
  const t = businessDedicatedVideoCopy(useLocale());
  const id = useId();
  const wan27 = capability.family === "wan2.7";
  const wan3 = capability.family === "wan3.0";
  const modes = capability.modes.filter(mode => MODE_KEYS[mode] !== undefined);
  const mode = value.mode === "freestyle" ? capability.capability : value.mode;
  const maximum = mode === "text-to-video" ? 0 : mode === "image-to-video" ? 1 : mode === "first-last-frame" ? 2 : capability.maxReferenceImages;
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
    {maximum > 0 ? <div className={styles.references}>
      <span className={styles.count}>{interpolate(t.selected, { count: referenceCount, max: maximum })}</span>
      {onOpenAssets ? <button type="button" onClick={onOpenAssets}>{t.openAssets}</button> : null}
      {referenceCount > maximum ? <p role="alert" className={styles.warning}>{t.referenceLimit}</p> : null}
      <p className={styles.note}>{t.assetsNote}</p>
      {wan3 ? <p className={styles.note}>{t.wan3ImageRules}</p> : !wan27 ? <p className={styles.note}>{t.happyRules}</p> : null}
      {!wan27 && mode === "subject-reference" ? <p className={styles.note}>{wan3 ? t.wan3ReferenceInfo : t.happyReferenceInfo}</p> : null}
    </div> : null}
    <details className={styles.advanced}>
      <summary>{t.advanced}</summary>
      <div className={styles.body}>
        {!wan3 ? <>
          <label className={styles.check}><input type="checkbox" checked={value.watermark} onChange={event => update({ watermark: event.target.checked })} aria-describedby={`${id}-watermark-info`} /><span>{t.watermark}</span></label>
          <p id={`${id}-watermark-info`} className={styles.note}>{t.watermarkInfo}</p>
        </> : null}
        <label className={styles.field} htmlFor={`${id}-seed`}>{t.seed}<input id={`${id}-seed`} type="text" inputMode="numeric" autoComplete="off" value={value.seed} onChange={event => update({ seed: event.target.value })} placeholder={t.seedPlaceholder} aria-describedby={`${id}-seed-info`} /></label>
        <p id={`${id}-seed-info`} className={styles.note}>{wan3 ? t.wan3Seed : wan27 ? t.seedWan : t.seedHappy}</p>
        {wan27 || wan3 ? <>
          <label className={styles.check}><input type="checkbox" checked={value.promptExtend} onChange={event => update({ promptExtend: event.target.checked })} aria-describedby={`${id}-extend-info`} /><span>{t.promptExtend}</span></label>
          <p id={`${id}-extend-info`} className={styles.note}>{t.promptExtendInfo}</p>
          {wan27 ? <>
            <label className={styles.field} htmlFor={`${id}-negative`}>{t.negative}<textarea id={`${id}-negative`} value={value.negativePrompt} maxLength={4000} onChange={event => update({ negativePrompt: event.target.value })} placeholder={t.negativePlaceholder} aria-describedby={`${id}-negative-count`} /></label>
            <span id={`${id}-negative-count`} className={styles.note}>{interpolate(t.negativeCount, { count: value.negativePrompt.length })}</span>
          </> : null}
        </> : null}
      </div>
    </details>
    <a className={styles.docs} href={`https://docs.siraya.ai/docs/api-reference/generative-model-api/text-to-video/${wan27 || wan3 ? "wan" : "happyhorse"}/`} target="_blank" rel="noreferrer">{t.providerDocs} ↗</a>
  </fieldset>;
}
