"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n/locale";
import { businessPricePreviewCopy } from "@/lib/i18n/businessPricePreview";
import type { BusinessPricePreview as Preview, BusinessPriceSettings } from "@/lib/businessPricePreview";
import styles from "./Business.module.css";

export default function BusinessPricePreview({ requestId, settings, locale, onSettled }: {
  requestId: string; settings: BusinessPriceSettings; locale: Locale; onSettled: (requestId: string) => void;
}) {
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);
  const request = JSON.stringify(settings);
  const t = businessPricePreviewCopy(locale);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(async () => {
      if (controller.signal.aborted) return;
      let value: Preview | null = null;
      try {
        const response = await fetch("/api/business/price-preview", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: request, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(9000)]),
        });
        if (response.ok) value = (await response.json()).preview ?? null;
      } catch { /* A failed read leaves the price unknown. */ }
      if (!controller.signal.aborted) {
        setPreview(value);
        onSettled(requestId);
      }
    });
    return () => controller.abort();
  }, [onSettled, request, requestId]);

  const money = (amount: string) => {
    const n = Number(amount);
    if (n > 0 && n < 0.000001) return "< USD 0.000001";
    const currency = new Intl.NumberFormat(locale, { style: "currency", currency: "USD", currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: n < 0.01 ? 6 : 4 });
    return currency.format(n);
  };
  const range = ({ low, high }: { low: string; high: string }) => money(low) === money(high) ? money(low) : money(low) + " – " + money(high);
  const rates = preview?.rates.length ? <ul className={styles.quoteRates}>{preview.rates.map(rate =>
    <li key={rate.unit}><span>{t.units[rate.unit]}</span><b>{range(rate)}</b></li>)}</ul> : null;

  return <section className={styles.pricePreview} aria-label={t.title} aria-live="polite" aria-busy={preview === undefined}>
    <div className={styles.quoteHeading}><h3>{t.title}</h3><a href="https://console.siraya.ai/models" target="_blank" rel="noreferrer">{t.priceSource} ↗</a></div>
    {preview === undefined ? <p>{t.loading}</p>
      : preview?.total ? <>
        <div className={styles.quoteTotal}><span>{t.estimate}</span><strong>{range(preview.total)}</strong></div>
        <p>{t.basis[preview.total.basis]}</p>
        {rates && <details><summary>{t.rateDetails}</summary>{rates}</details>}
      </> : preview?.reason && preview.reason !== "unavailable" && rates ? <>
        <p>{t[preview.reason]}</p>{rates}
      </> : <p>{t.unavailable}</p>}
    <p className={styles.quoteFoot}>{t.noCharge}{preview?.rates.length ? " " + t.settlement : ""}</p>
  </section>;
}
