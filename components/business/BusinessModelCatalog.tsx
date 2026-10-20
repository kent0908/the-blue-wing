"use client";

import { useId, useMemo, useState } from "react";
import ModelLogo from "@/components/ModelLogo";
import { useLocale } from "@/lib/i18n/client";
import { businessOperationsCopy } from "@/lib/i18n/businessOperations";
import type { BusinessModel, BusinessUnavailableModel } from "./types";
import styles from "./BusinessOperations.module.css";

interface Props { models: BusinessModel[]; unavailableModels: BusinessUnavailableModel[]; upstreamTotal: number; loading: boolean; onRefresh: () => void; onChoose: (id: string) => void }
export default function BusinessModelCatalog({ models, unavailableModels, upstreamTotal, loading, onRefresh, onChoose }: Props) {
  const locale = useLocale(), t = businessOperationsCopy(locale), searchId = useId();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const entries = useMemo(() => [
    ...models.map(model => ({ id: model.id, name: model.displayName, category: model.modality as string, ready: true, reason: "" })),
    ...unavailableModels.map(model => ({ id: model.id, name: model.displayName, category: model.category as string, ready: false, reason: model.reason })),
  ].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)), [models, unavailableModels]);
  const categories = ["all", "image", "video", "text", "tool"] as const;
  const visible = entries.filter(entry => (category === "all" || category === "tool" ? category === "all" || !["image", "video", "text"].includes(entry.category) : entry.category === category) && `${entry.id} ${entry.name}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const categoryText = (value: string) => value === "image" || value === "video" || value === "text" || value === "audio" ? t[value] : t.tool;
  return <section className={styles.page}>
    <div className={styles.headingRow}><div><p className={styles.eyebrow}>SIRAYA / MODEL INDEX</p><h2>{t.modelsTitle}</h2><p className={styles.description}>{t.modelsDescription}</p></div><button className={styles.button} onClick={onRefresh} disabled={loading}>{loading ? t.refreshing : t.refresh}</button></div>
    <div className={styles.catalogMeta}><span>{t.count.replace("{count}", String(upstreamTotal || entries.length))}</span><p>{t.providerPricing}</p></div>
    <div className={styles.toolbar}><label className={styles.search} htmlFor={searchId}><span>{t.search}</span><input id={searchId} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t.search} /></label><div className={styles.filters} role="group" aria-label={t.models}>{categories.map(value => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}>{t[value]}</button>)}</div></div>
    <div className={styles.modelRows} aria-busy={loading}>{visible.map(entry => <article className={styles.modelRow} key={entry.id}><ModelLogo id={entry.id} size={32} /><div className={styles.modelIdentity}><h3>{entry.name}</h3><p>{entry.id}</p>{!entry.ready && <p>{entry.reason === "retired" ? t.retired : t.adapterRequired}</p>}</div><span className={styles.category}>{categoryText(entry.category)}</span><div className={styles.modelAction}>{entry.ready ? <button type="button" className={styles.button} onClick={() => onChoose(entry.id)}>{t.useModel}<span aria-hidden="true">↗</span></button> : <span className={styles.notReady}>{entry.reason === "retired" ? t.disabled : t.dedicated}</span>}</div></article>)}</div>
    {!visible.length && <p className={styles.empty}>{t.noModels}</p>}
  </section>;
}
