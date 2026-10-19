"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/client";
import { businessCopy, businessError } from "@/lib/i18n/business";
import BusinessDialog from "./BusinessDialog";
import type { BusinessAccount, BusinessStatus } from "./types";
import styles from "./Business.module.css";

interface Review { account: BusinessAccount; status: Exclude<BusinessStatus, "pending">; note: string }

export default function BusinessAdmin() {
  const locale = useLocale();
  const t = businessCopy(locale);
  const [accounts, setAccounts] = useState<BusinessAccount[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | BusinessStatus>("pending");
  const [review, setReview] = useState<Review | null>(null);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/business", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) { setError(response.status === 403 ? t.adminOnly : businessError(t, data?.error?.code)); return; }
      const applications = (data.accounts ?? []) as BusinessAccount[];
      setAccounts(applications);
      setNotes(Object.fromEntries(applications.map(account => [account.id, account.reviewNote ?? ""])));
      setError("");
    } catch { setError(t.unavailable); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- begins this private view's asynchronous API fetch
    void load();
  }, [load]);
  const filtered = accounts.filter(account => (!status || account.status === status) && `${account.companyName} ${account.email ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const dateLabel = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date); };
  const choose = (account: BusinessAccount, target: Review["status"]) => { setReview({ account, status: target, note: (notes[account.id] ?? "").trim() }); setError(""); setNotice(""); };
  const save = async () => {
    if (!review || saveLock.current) return;
    saveLock.current = true; setSaving(true);
    try {
      const response = await fetch("/api/admin/business", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: review.account.userId, status: review.status, reviewNote: review.note || null, expectedUpdatedAt: review.account.updatedAt }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) { setError(response.status === 409 ? t.conflict : businessError(t, data?.error?.code)); if (response.status === 409) setReview(null); return; }
      setReview(null); await load(); setNotice(t.refreshed);
    } catch { setError(t.unavailable); }
    finally { saveLock.current = false; setSaving(false); }
  };
  return <div className={`${styles.page} ${styles.admin}`}><div className={styles.inner}>
    <header className={styles.hero}><div><p className={styles.eyebrow}>THE BLUE WING / BUSINESS ACCESS</p><h1 style={{ fontSize: "clamp(30px,3.4vw,48px)" }}>{t.reviewTitle}</h1><p>{t.reviewDescription}</p></div><div className={styles.row}><Link href="/business" className={styles.secondary}>{t.back} ↗</Link></div></header>
    <section className={styles.panel}>
      <div className={styles.panelHead}><div className={styles.row}><span className={styles.status}>{t.pending} · {accounts.filter(account => account.status === "pending").length}</span><span className={styles.status}>{t.approved} · {accounts.filter(account => account.status === "approved").length}</span></div><button type="button" className={styles.small} disabled={loading} onClick={load}>{loading ? t.checking : t.refresh}</button></div>
      {error ? <p className={styles.feedback} role="alert">{error}</p> : null}{notice ? <p className={styles.success} role="status">{notice}</p> : null}
      <div className={styles.toolbar}><label className={styles.field}><span>{t.search}</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t.search} /></label><label className={styles.field}>{t.filter}<select value={status} onChange={event => setStatus(event.target.value as typeof status)}><option value="">{t.all}</option>{(["pending", "approved", "rejected", "suspended"] as const).map(value => <option key={value} value={value}>{t[value]}</option>)}</select></label></div>
      {loading ? <p role="status" className={styles.description}>{t.loading}</p> : !filtered.length ? <p className={styles.description}>{t.emptyApplications}</p> : filtered.map(account => <article key={account.id} className={styles.application}><div><h2>{account.companyName}</h2><span className={styles.status}>{t[account.status]}</span><p>{account.useCase}</p><dl><dt>{t.applicant}</dt><dd>{account.email ?? `#${account.userId}`}</dd><dt>{t.appliedAt}</dt><dd>{dateLabel(account.createdAt)}</dd><dt>{t.updatedAt}</dt><dd>{dateLabel(account.updatedAt)}</dd></dl></div><div><label className={styles.field}>{t.reviewNote}<textarea maxLength={2000} value={notes[account.id] ?? ""} onChange={event => setNotes(current => ({ ...current, [account.id]: event.target.value }))} placeholder={t.notePlaceholder} /></label><div className={styles.row} style={{ marginTop: 14 }}>{account.status !== "approved" ? <button type="button" className={styles.small} onClick={() => choose(account, "approved")}>{account.status === "suspended" ? t.approveAgain : t.approve}</button> : null}{account.status !== "rejected" ? <button type="button" className={styles.small} onClick={() => choose(account, "rejected")}>{t.reject}</button> : null}{account.status !== "suspended" ? <button type="button" className={styles.small} onClick={() => choose(account, "suspended")}>{t.suspend}</button> : null}</div></div></article>)}
    </section>
    {review ? <BusinessDialog title={t.reviewConfirm} busy={saving} onClose={() => setReview(null)}><p>{t.reviewConfirmText}</p><dl><dt>{t.company}</dt><dd>{review.account.companyName}</dd><dt>{t.status}</dt><dd>{t[review.account.status]} → {t[review.status]}</dd></dl>{review.note ? <p className={styles.dialogPrompt}>{review.note}</p> : null}<div className={styles.dialogActions}><button type="button" className={styles.button} onClick={save} disabled={saving}>{saving ? t.saving : t.saveReview}</button><button type="button" className={styles.secondary} disabled={saving} onClick={() => setReview(null)}>{t.cancel}</button></div></BusinessDialog> : null}
  </div></div>;
}
