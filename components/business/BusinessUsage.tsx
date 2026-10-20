"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/client";
import { businessCopy } from "@/lib/i18n/business";
import { businessOperationsCopy } from "@/lib/i18n/businessOperations";
import { modelLabel } from "@/lib/modelLabel";
import type { BusinessGeneration } from "./types";
import BusinessGenerationReceipt, { businessCostText, businessDurationText } from "./BusinessGenerationReceipt";
import styles from "./BusinessOperations.module.css";

interface Report {
  generations: BusinessGeneration[]; models: string[]; range: { from: string; to: string; timezone: string };
  pagination: { page: number; total: number; totalPages: number; hasMore: boolean };
  stats: { requests: number; completed: number; failed: number; pending: number; matchedCost: string | null; currency: string; unmatchedCount: number };
}
export default function BusinessUsage() {
  const locale = useLocale(), t = businessOperationsCopy(locale), b = businessCopy(locale);
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [model, setModel] = useState(""), [status, setStatus] = useState("");
  const [report, setReport] = useState<Report | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const activeQuery = useRef("");
  const load = useCallback(async (query = "", page = 1) => {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setLoading(true); setError("");
    const params = new URLSearchParams(query); params.set("page", String(page));
    try {
      const response = await fetch(`/api/business/usage?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!response.ok || !Array.isArray(body?.generations) || !body.pagination || !body.stats || !body.range) throw new Error("usage");
      setReport(body); activeQuery.current = query;
      if (!query) { setFrom(body.range.from); setTo(body.range.to); }
    } catch { if (!controller.signal.aborted) setError(t.billingFailed); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [t.billingFailed]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; pending.current?.abort(); };
  }, [load]);
  const apply = (event: React.FormEvent) => {
    event.preventDefault(); const query = new URLSearchParams();
    if (from) query.set("from", from); if (to) query.set("to", to); if (model) query.set("model", model); if (status) query.set("status", status);
    void load(query.toString());
  };
  const onUpdated = (job: BusinessGeneration) => {
    setReport(current => current ? { ...current, generations: current.generations.map(old => old.id === job.id ? job : old) } : current);
    void load(activeQuery.current, report?.pagination.page ?? 1);
  };
  const download = () => {
    if (!report) return;
    const safe = (value: string | number | null | undefined) => `"${String(value ?? "").replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
    const rows = [[t.generationId, t.providerRequest, t.model, t.status, t.submitted, t.completed, `${t.elapsed} (ms)`, t.cost], ...report.generations.map(job => [job.id, job.providerRequestId, job.model, b[job.status], job.submittedAt ?? job.createdAt, job.completedAt, job.durationMs, job.billingStatus === "matched" ? `${job.providerCurrency} ${job.providerCost}` : businessCostText(job, t)])];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(row => row.map(safe).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `business-usage-${report.range.from}-${report.range.to}-page${report.pagination.page}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const date = (value: string) => new Intl.DateTimeFormat(locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Taipei" }).format(new Date(value));
  const page = report?.pagination.page ?? 1;
  return <section className={styles.page}>
    <div className={styles.headingRow}><div><p className={styles.eyebrow}>BUSINESS / USAGE & RECEIPTS</p><h2>{t.usageTitle}</h2><p className={styles.description}>{t.usageDescription}</p></div><button className={styles.button} disabled={loading} onClick={() => void load(activeQuery.current, page)}>{loading ? t.refreshing : t.reload}</button></div>
    {report && <dl className={styles.stats}><div className={styles.stat}><dt>{t.totalJobs}</dt><dd>{report.stats.requests.toLocaleString(locale)}</dd><small>{t.completedJobs} {report.stats.completed} · {t.failedJobs} {report.stats.failed}</small></div><div className={styles.stat}><dt>{t.totalCost}</dt><dd>{report.stats.matchedCost === null ? "—" : report.stats.matchedCost}</dd><small>{report.stats.currency} · {t.pendingCost} {report.stats.unmatchedCount}</small></div><div className={styles.stat}><dt>{t.pendingJobs}</dt><dd>{report.stats.pending}</dd></div><div className={styles.stat}><dt>{t.completedJobs}</dt><dd>{report.stats.completed}</dd><small><span className={styles.dateRange}>{report.range.from} —</span><span className={styles.dateRange}>{report.range.to}</span>Asia/Taipei</small></div></dl>}
    <form className={styles.form} onSubmit={apply}><label className={styles.field}>{t.dateFrom}<input type="date" required value={from} onChange={e => setFrom(e.target.value)} max={to || undefined} /></label><label className={styles.field}>{t.dateTo}<input type="date" required value={to} onChange={e => setTo(e.target.value)} min={from || undefined} /></label><label className={styles.field}>{t.model}<select value={model} onChange={e => setModel(e.target.value)}><option value="">{t.all}</option>{report?.models.map(value => <option key={value} value={value}>{modelLabel(value)}</option>)}</select></label><label className={styles.field}>{t.status}<select value={status} onChange={e => setStatus(e.target.value)}><option value="">{t.all}</option>{(["completed", "failed", "processing", "submitting", "unknown"] as const).map(value => <option key={value} value={value}>{b[value]}</option>)}</select></label><div className={styles.rowActions}><button className={styles.button} disabled={loading} type="submit">{t.apply}</button><button className={styles.button} disabled={loading} type="button" onClick={() => { setModel(""); setStatus(""); void load(); }}>{t.clear}</button></div></form>
    <p className={styles.notice}>{t.noCostEstimate}</p>
    {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    {report?.generations.length ? <><div className={styles.rowActions}><span>{t.recordCount.replace("{count}", String(report.pagination.total))}</span><button type="button" className={styles.button} onClick={download}>{t.download} · {page}</button></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>{t.submitted}</th><th>{t.model}</th><th>{t.status}</th><th>{t.elapsed}</th><th>{t.cost}</th></tr></thead><tbody>{report.generations.map(job => <tr key={job.id}><td>{date(job.submittedAt ?? job.createdAt)}<small>{job.id}</small></td><td>{modelLabel(job.model)}<small>{job.kind}</small></td><td>{b[job.status]}{job.providerHttpStatus ? <small>HTTP {job.providerHttpStatus}</small> : null}</td><td>{businessDurationText(job.durationMs, locale, t.seconds) ?? t.unknown}</td><td><span className={job.billingStatus === "matched" ? styles.cost : styles.pending}>{businessCostText(job, t)}</span><BusinessGenerationReceipt job={job} onUpdated={onUpdated} /></td></tr>)}</tbody></table></div><div className={styles.pagination}><button className={styles.button} type="button" disabled={loading || page <= 1} onClick={() => void load(activeQuery.current, page - 1)} aria-label={t.previous}>←</button><span>{page} / {report.pagination.totalPages}</span><button className={styles.button} type="button" disabled={loading || !report.pagination.hasMore} onClick={() => void load(activeQuery.current, page + 1)} aria-label={t.next}>→</button></div></> : !loading && <p className={styles.empty}>{t.noHistory}</p>}
  </section>;
}
