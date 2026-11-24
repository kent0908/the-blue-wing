"use client";

import { useCallback, useState } from "react";
import { useLocale } from "@/lib/i18n/client";
import { studioDesignCopy } from "@/lib/i18n/studioDesign";
import { businessWorkflowsCopy } from "@/lib/i18n/businessWorkflows";
import type { CanvasNode } from "@/lib/canvas/types";
import type { BusinessPriceSettings } from "@/lib/businessPricePreview";
import BusinessDialog from "./BusinessDialog";
import BusinessPricePreview from "./BusinessPricePreview";
import styles from "./BusinessWorkflowEditor.module.css";

export interface WorkflowReviewNode { node: CanvasNode; label: string; settings?: BusinessPriceSettings }

export default function BusinessWorkflowReview({ nodes, onFinish }: { nodes: WorkflowReviewNode[]; onFinish: (approved: boolean) => void }) {
  const locale = useLocale(), t = businessWorkflowsCopy(locale), copy = studioDesignCopy(locale);
  const [quotes, setQuotes] = useState<Record<string, boolean>>({});
  const [accepted, setAccepted] = useState(false);
  const onSettled = useCallback((id: string, hasTotal = false) => setQuotes(current => ({ ...current, [id]: hasTotal })), []);
  const paid = nodes.filter(({ node }) => node.type === "image" || node.type === "video");
  const loading = paid.some(row => row.settings && quotes[row.node.id] === undefined);
  const unknown = paid.some(row => !row.settings || quotes[row.node.id] === false);
  return <BusinessDialog className={styles.reviewDialog} title={t.reviewTitle} onClose={() => onFinish(false)}>
    <p className={styles.plan}>{copy.runNotice}</p>
    <h3 className={styles.reviewHeading}>{copy.runSummary}</h3>
    <ol className={styles.runList}>{nodes.map(({ node, label, settings }, index) => {
      const generates = node.type === "image" || node.type === "video";
      return <li key={node.id}>
        <div className={styles.runHeading}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{label}</strong><small>{generates ? copy.newGeneration : copy.sourceOnly}</small></div></div>
        {generates && <p className={styles.runSettings}>{node.type === "video" ? `${settings?.seconds ?? node.data.seconds ?? "—"}s · ${settings?.resolution ?? node.data.resolution ?? "—"} · ${settings?.aspect ?? node.data.aspect_ratio ?? "—"}` : String(settings?.size ?? node.data.size ?? "—")}</p>}
        {settings ? <BusinessPricePreview requestId={node.id} settings={settings} locale={locale} onSettled={onSettled} /> : generates ? <p className={styles.runUnknown}>{copy.unknownPrice}</p> : null}
      </li>;
    })}</ol>
    <p className={styles.plan}>{t.billing}</p>
    <p className={styles.plan} role="status">{loading ? copy.checking : unknown ? copy.unknownHint : copy.reviewPrices}</p>
    {!loading && unknown && <label className={styles.checkbox}><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />{copy.acknowledge}</label>}
    <div className={styles.actions}><button type="button" autoFocus className={styles.button} onClick={() => onFinish(false)}>{t.cancel}</button><button type="button" className={styles.button} disabled={loading || unknown && !accepted} onClick={() => onFinish(true)}>{t.start}</button></div>
  </BusinessDialog>;
}
