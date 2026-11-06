"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/client";
import { businessCopy } from "@/lib/i18n/business";
import { businessStudioCopy } from "@/lib/i18n/businessStudio";
import { businessResultsCopy } from "@/lib/i18n/businessResults";
import { businessSeedanceCopy } from "@/lib/i18n/businessSeedance";
import { modelLabel } from "@/lib/modelLabel";
import type { BusinessGeneration } from "./types";
import BusinessStage, { ResultCard, ResultDialog } from "./BusinessStage";
import styles from "./BusinessResults.module.css";

export default function BusinessCollection({ jobs, refreshing, onRefresh, onReuse, onJobUpdated }: { jobs: BusinessGeneration[]; refreshing: boolean; onRefresh: () => void; onReuse: (job: BusinessGeneration) => void; onJobUpdated: (job: BusinessGeneration) => void }) {
  const locale = useLocale();
  const t = businessCopy(locale), c = businessResultsCopy(locale);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("latest");
  const [limit, setLimit] = useState(24);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filtered = jobs.filter(job => (kind === "all" || job.kind === kind) && (status === "all" || job.status === status) && `${job.prompt} ${job.model} ${modelLabel(job.model)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim())).sort((a, b) => (sort === "latest" ? -1 : 1) * a.createdAt.localeCompare(b.createdAt));
  const selected = jobs.find(job => job.id === selectedId);
  return <div>
    <div className={styles.collectionHeader}><div><h2>{c.results}</h2><p>{c.count.replace("{n}", String(filtered.length))}</p></div><button className={styles.button} type="button" onClick={onRefresh} disabled={refreshing}>{refreshing ? t.checking : t.refresh}</button></div>
    <div className={styles.filters}>
      <label>{c.search}<input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(24); }} /></label>
      <label>{c.type}<select value={kind} onChange={event => { setKind(event.target.value); setLimit(24); }}>{["all", "image", "video", "text"].map(value => <option key={value} value={value}>{value === "all" ? c.all : t[value as "image" | "video" | "text"]}</option>)}</select></label>
      <label>{c.status}<select value={status} onChange={event => { setStatus(event.target.value); setLimit(24); }}>{["all", "completed", "processing", "submitting", "failed", "unknown"].map(value => <option key={value} value={value}>{value === "all" ? c.all : t[value as BusinessGeneration["status"]]}</option>)}</select></label>
      <label>{c.sort}<select value={sort} onChange={event => setSort(event.target.value)}><option value="latest">{c.latest}</option><option value="oldest">{c.oldest}</option></select></label>
    </div>
    {filtered.length ? <div className={styles.grid}>{filtered.slice(0, limit).map(job => <ResultCard key={job.id} job={job} business={t} onClick={() => setSelectedId(job.id)} />)}</div> : <div className={styles.empty}><h3>{jobs.length ? c.noMatch : t.emptyHistory}</h3><p>{!jobs.length && t.emptyHistoryText}</p>{jobs.length > 0 && <button className={styles.button} type="button" onClick={() => { setQuery(""); setKind("all"); setStatus("all"); }}>{c.clear}</button>}</div>}
    {filtered.length > limit && <button className={`${styles.button} ${styles.more}`} type="button" onClick={() => setLimit(value => value + 24)}>{c.more}</button>}
    {selected && <ResultDialog title={modelLabel(selected.model)} closeLabel={c.close} onClose={() => setSelectedId(null)}><BusinessStage key={selected.id} copy={businessStudioCopy(locale)} business={t} kind={selected.kind} job={selected} onHistory={() => setSelectedId(null)} onRefresh={onRefresh} refreshing={refreshing} movNotice={businessSeedanceCopy(locale).movNotice} onJobUpdated={onJobUpdated} onReuse={job => { setSelectedId(null); onReuse(job); }} inDialog /></ResultDialog>}
  </div>;
}
