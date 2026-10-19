"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { IconImage, IconVideo, IconChat, IconHistory, IconWing } from "@/components/Icons";
import ModelLogo from "@/components/ModelLogo";
import type { BusinessCopy } from "@/lib/i18n/business";
import type { businessStudioCopy } from "@/lib/i18n/businessStudio";
import type { BusinessKind, BusinessModel } from "./types";
import styles from "./BusinessStudio.module.css";

export interface BusinessStudioNavProps {
  copy: ReturnType<typeof businessStudioCopy>;
  business: BusinessCopy;
  approved: boolean;
  keyConfigured: boolean;
  modelsLoading: boolean;
  models: BusinessModel[];
  kind: BusinessKind;
  selectedId: string;
  tab: "create" | "key" | "history";
  onKind: (kind: BusinessKind) => void;
  onModel: (id: string) => void;
  onTab: (tab: "create" | "key" | "history") => void;
}

const KINDS = [
  { kind: "image", icon: IconImage, title: "imageTitle", number: "01" },
  { kind: "video", icon: IconVideo, title: "videoTitle", number: "02" },
  { kind: "text", icon: IconChat, title: "textTitle", number: "03" },
] as const;

export default function BusinessStudioNav({ copy, business, approved, keyConfigured, modelsLoading, models, kind, selectedId, tab, onKind, onModel, onTab }: BusinessStudioNavProps) {
  const [search, setSearch] = useState("");
  const mobileModels = useRef<HTMLDetailsElement>(null);
  const searchId = useId();
  const available = models.filter(model => model.modality === kind);
  const query = search.trim().toLocaleLowerCase();
  const filtered = available.filter(model => !query || `${model.id} ${model.displayName}`.toLocaleLowerCase().includes(query));
  const selected = available.find(model => model.id === selectedId);
  const closeModelMenu = () => { if (mobileModels.current) mobileModels.current.open = false; };
  const chooseKind = (next: BusinessKind) => { setSearch(""); closeModelMenu(); onKind(next); };
  const chooseModel = (id: string) => { closeModelMenu(); onModel(id); };
  const modelContents = (suffix: string) => <div className={styles.modelContents}>
    {approved && keyConfigured ? <>
      <label htmlFor={`${searchId}-${suffix}`} className={styles.searchLabel}>{copy.modelSearch}</label>
      <div className={styles.searchBox}><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5" /><path d="m12.3 12.3 4 4" /></svg><input id={`${searchId}-${suffix}`} type="search" value={search} placeholder={copy.modelSearch} onChange={event => setSearch(event.target.value)} autoComplete="off" /></div>
      <div className={styles.modelList} aria-busy={modelsLoading}>
        {modelsLoading ? <p className={styles.navEmpty} role="status">{business.loading}</p> : filtered.length ? filtered.map(model => <button type="button" key={model.id} className={styles.modelButton} aria-pressed={tab === "create" && selectedId === model.id} onClick={() => chooseModel(model.id)} title={model.displayName}>
          <ModelLogo id={model.id} size={25} /><span className={styles.modelName}>{model.displayName}{model.nsfw ? <span className={styles.adultBadge}>{business.nsfw}</span> : null}</span><span className={styles.modelDot} aria-hidden="true" />
        </button>) : <p className={styles.navEmpty}>{query ? copy.noResults : copy.noModels}</p>}
      </div>
    </> : <p className={styles.navEmpty}>{approved ? copy.keyNotConnected : copy.approvalNeeded}</p>}
  </div>;

  return <aside className={styles.nav} aria-label={copy.navigationLabel}>
    <div className={styles.navBrand}><IconWing className={styles.brandWing} /><div><span className={styles.brandName}>THE BLUE WING</span><span className={styles.brandCaption}>{copy.studioLabel}</span></div></div>
    <nav className={styles.navSections} aria-label={business.createTab}>
      {KINDS.map(item => <button key={item.kind} type="button" className={styles.kindButton} aria-pressed={tab === "create" && kind === item.kind} disabled={!approved} onClick={() => chooseKind(item.kind)}><item.icon className={styles.navIcon} /><span>{copy[item.title]}</span><span className={styles.kindNumber} aria-hidden="true">{item.number}</span></button>)}
    </nav>
    <section className={styles.desktopModels} aria-label={copy.modelsTitle}><div className={styles.modelsHeading}><h2>{copy.modelsTitle}</h2><span>{approved && keyConfigured ? available.length : "—"}</span></div>{modelContents("desktop")}</section>
    <details ref={mobileModels} className={styles.mobileModels}><summary><span><span className={styles.mobileModelLabel}>{copy.modelsTitle}</span><span className={styles.mobileModelValue}>{selected?.displayName ?? copy.modelsTitle}</span></span><svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 7 5 5 5-5" /></svg></summary>{modelContents("mobile")}</details>
    <div className={styles.navFooter}>
      <nav className={styles.utilityNav} aria-label={business.workspace}>
        <button type="button" className={styles.utilityButton} disabled={!approved} aria-pressed={tab === "history"} onClick={() => onTab("history")}><IconHistory className={styles.navIcon} /><span>{business.historyTab}</span></button>
        <button type="button" className={styles.utilityButton} disabled={!approved} aria-pressed={tab === "key"} onClick={() => onTab("key")}><svg viewBox="0 0 24 24" className={styles.navIcon} aria-hidden="true"><circle cx="8.5" cy="9" r="4" /><path d="m11.5 12 7 7 2-2-2-2 1.5-1.5" /></svg><span>{business.keyTab}</span><span className={styles.keyDot} data-connected={keyConfigured} aria-label={keyConfigured ? copy.keyConnected : business.notConfigured} /></button>
      </nav>
      <div className={styles.billingNote}><span aria-hidden="true">↗</span><p>{copy.ownKeyLabel}<br /><span>{business.noCredits}</span></p></div>
      <Link href="/studio" className={styles.returnLink}><span aria-hidden="true">←</span>{copy.returnConsumer}</Link>
    </div>
  </aside>;
}
