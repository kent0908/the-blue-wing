"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./Business.module.css";

export default function BusinessDialog({ title, children, onClose, busy = false, className }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => { node?.close(); };
  }, []);
  return <dialog ref={dialog} className={className ? `${styles.dialog} ${className}` : styles.dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <h2 id={titleId}>{title}</h2>{children}
  </dialog>;
}
