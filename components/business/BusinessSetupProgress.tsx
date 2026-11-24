"use client";

import { useLocale } from "@/lib/i18n/client";
import { studioDesignCopy } from "@/lib/i18n/studioDesign";
import styles from "./BusinessSetupProgress.module.css";

export default function BusinessSetupProgress({ step }: { step: number }) {
  const t = studioDesignCopy(useLocale());
  return <section className={styles.setup} aria-label={t.setup}>
    <ol className={styles.steps}>{[t.account, t.application, t.review, t.key, t.ready].map((label, index) =>
      <li key={label} aria-current={index === step ? "step" : undefined} data-complete={index < step}>
        <span aria-hidden="true">{index < step ? "✓" : String(index + 1).padStart(2, "0")}</span><strong>{label}</strong>
      </li>)}</ol>
    <aside className={styles.billing}><h2>{t.billingTitle}</h2><p>{t.billingHint}</p></aside>
  </section>;
}
