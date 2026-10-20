"use client";

import { useEffect, useId, useRef } from "react";
import { useLocale } from "@/lib/i18n/client";
import { canvasConnectionsCopy } from "@/lib/i18n/canvasConnections";
import styles from "./runConfirmation.module.css";

/** A page dialog keeps generation confirmation inside the editor, including on mobile. */
export default function CanvasRunConfirmation({ message, onDecision }: { message: string; onDecision: (confirmed: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId(); const descriptionId = useId();
  const copy = canvasConnectionsCopy[useLocale()];
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={headingId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); onDecision(false); }}
    onClose={() => { if (!dialog.current?.open) onDecision(false); }}>
    <h2 id={headingId}>{copy.runTitle}</h2>
    <p id={descriptionId}>{message}</p>
    <div className={styles.actions}>
      <button type="button" autoFocus onClick={() => onDecision(false)}>{copy.runCancel}</button>
      <button type="button" className={styles.confirm} onClick={() => onDecision(true)}>{copy.runConfirm}</button>
    </div>
  </dialog>;
}
