"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { birthDateDays, selectedBirthDate } from "@/lib/birthDateInput";
import styles from "./AdultGate.module.css";
import { useTr } from "@/lib/i18n/client";

/**
 * 18+ interstitial for the 陪聊 area, mounted from app/companions/layout.tsx
 * so it covers the shelf, the builder and every chat page.
 *
 * This is the courtesy half of the gate. The enforcement is
 * requireAdultUser() in lib/apiauth.ts, which every /api/characters route
 * uses — a user who never renders this still cannot read or write a single
 * companion.
 *
 * `verified` is resolved on the server by the layout, so there is no loading
 * state, no blank first paint and no flash of the shelf before the gate.
 *
 * Signed-out visitors pass straight through: the public shelf (and its SEO)
 * has to keep working, the pages behind this handle their own sign-in prompts,
 * and a birthday typed by someone without an account has nowhere to be stored.
 */
export default function AdultGate({
  signedIn,
  verified,
  children,
}: {
  signedIn: boolean;
  verified: boolean;
  children: React.ReactNode;
}) {
  const tr = useTr();
  const router = useRouter();
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const birthDate = selectedBirthDate(year, month, day);
  const dayCount = birthDateDays(year, month);
  const currentYear = new Date().getUTCFullYear();
  const changeCalendar = (nextYear: string, nextMonth: string) => {
    setYear(nextYear); setMonth(nextMonth);
    if (Number(day) > birthDateDays(nextYear, nextMonth)) setDay("");
  };
  const [error, setError] = useState("");
  const [rejected, setRejected] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !birthDate) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/account/age", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDate }),
      });
      const json = await res.json().catch(() => ({}));
      // The layout decides the gate, so re-render from the server rather than
      // flipping local state — that also refreshes anything else it resolved.
      if (res.ok && json?.verified) return router.refresh();
      // An under-age answer is final for this visit. Leaving the field to retry
      // would only teach the visitor which year to type instead.
      if (json?.error?.code === "under_age") return setRejected(true);
      setError(json?.error?.message || tr("確認失敗，請稍後再試。"));
    } catch {
      setError(tr("確認失敗，請稍後再試。"));
    } finally {
      setSaving(false);
    }
  }, [birthDate, saving, tr, router]);

  if (verified || !signedIn) return <>{children}</>;


  return (
    <section className={styles.page} aria-labelledby="age-title">
      <div className={styles.art} aria-hidden="true">
        <span className={styles.orbit} /><span className={styles.wing} />
        <span className={styles.artCaption}>THE BLUE WING<br/>A SPACE FOR STORIES</span>
      </div>
      <div className={styles.panel}>
        <p className={styles.eyebrow}>THE BLUE WING <span> / </span> COMPANIONS</p>
        <h1 id="age-title" className={styles.title}>{tr("陪聊區限 18 歲以上")}</h1>
        {rejected ? (
          <p className={styles.description}>
            {tr("你填寫的出生日期未滿 18 歲，無法進入陪聊區。網站的其他功能不受影響。")}
          </p>
        ) : (
          <form onSubmit={submit} className={styles.form}>
            <p className={styles.description}>
              {tr("這個區域的角色互動包含成人向內容。請選擇你的出生日期。")}
            </p>
            <fieldset className={styles.dateFields} disabled={saving}>
              <legend>{tr("出生日期")}</legend>
              <div className={styles.dateGrid}>
                <label>{tr("年份")}
                  <select aria-label={tr("出生年份")} required value={year} onChange={e => changeCalendar(e.target.value, month)}>
                    <option value="">YYYY</option>
                    {Array.from({length:121},(_,i)=>currentYear-i).map(y=><option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
                <label>{tr("月份")}
                  <select aria-label={tr("出生月份")} required value={month} onChange={e => changeCalendar(year,e.target.value)}>
                    <option value="">MM</option>
                    {Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>{String(m).padStart(2,"0")}</option>)}
                  </select>
                </label>
                <label>{tr("日期")}
                  <select aria-label={tr("出生日期中的日")} required disabled={!dayCount} value={day} onChange={e => setDay(e.target.value)}>
                    <option value="">DD</option>
                    {Array.from({length:dayCount},(_,i)=>i+1).map(d=><option key={d} value={d}>{String(d).padStart(2,"0")}</option>)}
                  </select>
                </label>
              </div>
            </fieldset>
            {error ? <p role="alert" className={styles.error}>{error}</p> : null}
            <button
              type="submit"
              disabled={saving || !birthDate}
              className={styles.submit}
            >
              {saving ? tr("確認中…") : tr("確認並進入")}
            </button>
            <p className={styles.privacy}>
              {tr("我們只用這個日期判斷是否滿 18 歲，不會公開顯示。")}
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
