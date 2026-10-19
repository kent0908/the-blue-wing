"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./Business.module.css";

export default function BusinessDialog({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => { node?.close(); };
  }, []);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="business-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <h2 id="business-dialog-title">{title}</h2>{children}
  </dialog>;
}
