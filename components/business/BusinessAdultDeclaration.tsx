"use client";

import { useState } from "react";
import { birthDateDays, selectedBirthDate } from "@/lib/birthDateInput";
import type { BusinessCopy } from "@/lib/i18n/business";
import styles from "./Business.module.css";

export default function BusinessAdultDeclaration({ copy: t, onVerified }: { copy: BusinessCopy; onVerified: () => Promise<void> }) {
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [saving, setSaving] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [error, setError] = useState("");
  const currentYear = new Date().getUTCFullYear();
  const days = birthDateDays(year, month);
  const birthDate = selectedBirthDate(year, month, day);
  const change = (y: string, m: string) => { setYear(y); setMonth(m); if (Number(day) > birthDateDays(y, m)) setDay(""); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!birthDate || saving || rejected) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/business/adult", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ birthDate }) });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.verified) await onVerified();
      else if (data?.error?.code === "under_age") setRejected(true);
      else setError(t.invalidRequest);
    } catch { setError(t.unavailable); }
    finally { setSaving(false); }
  };
  return <section className={styles.adult} aria-labelledby="business-adult-title"><h3 id="business-adult-title">{t.adultTitle}</h3>
    {rejected ? <p role="alert">{t.underAge}</p> : <form onSubmit={submit}><p>{t.adultText}</p>
      <fieldset className={styles.birth} disabled={saving}><legend>{t.birthday}</legend><div className={styles.birthGrid}>
        <label className={styles.field}>{t.year}<select required value={year} onChange={e => change(e.target.value, month)}><option value="">YYYY</option>{Array.from({ length: 121 }, (_, i) => currentYear - i).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className={styles.field}>{t.month}<select required value={month} onChange={e => change(year, e.target.value)}><option value="">MM</option>{Array.from({ length: 12 }, (_, i) => i + 1).map(value => <option key={value} value={value}>{String(value).padStart(2, "0")}</option>)}</select></label>
        <label className={styles.field}>{t.day}<select required value={day} disabled={!days} onChange={e => setDay(e.target.value)}><option value="">DD</option>{Array.from({ length: days }, (_, i) => i + 1).map(value => <option key={value} value={value}>{String(value).padStart(2, "0")}</option>)}</select></label>
      </div></fieldset>{error ? <p role="alert" className={styles.feedback}>{error}</p> : null}<button className={styles.secondary} type="submit" disabled={saving || !birthDate}>{saving ? t.saving : t.confirmAge}</button><p className={styles.note}>{t.adultPrivacy}</p>
    </form>}
  </section>;
}
