"use client";
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconAlertTriangle, IconX } from "@tabler/icons-react";

export function RemoveSourceDialog({ open, sourceLabel, hasData, onCancel, onConfirm }: { open: boolean; sourceLabel: string; hasData: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDivElement>(null), previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    previous.current = document.activeElement as HTMLElement;
    const old = document.body.style.overflow; document.body.style.overflow = "hidden";
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    addEventListener("keydown", key); requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>("button")?.focus());
    return () => { document.body.style.overflow = old; removeEventListener("keydown", key); previous.current?.focus(); };
  }, [open, onCancel]);
  return <AnimatePresence>{open ? <div className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-950/70 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}><motion.div ref={dialog} role="alertdialog" aria-modal="true" aria-labelledby="remove-source-title" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="w-full rounded-t-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:max-w-md sm:rounded-xl">
    <div className="flex items-start justify-between gap-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"><IconAlertTriangle className="h-5 w-5"/></span><button onClick={onCancel} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700"><IconX className="h-4 w-4"/></button></div>
    <h2 id="remove-source-title" className="mt-4 text-lg font-semibold">Remove {sourceLabel}?</h2><p className="mt-2 text-sm leading-6 text-slate-500">{hasData ? "The retrieved structure and its current comparison context will be removed from this workspace." : "The source setup will be removed from this workspace."}</p>
    <div className="mt-6 flex justify-end gap-2"><button onClick={onCancel} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold dark:border-slate-700">Cancel</button><button onClick={onConfirm} className="h-10 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-500">Remove source</button></div>
  </motion.div></div> : null}</AnimatePresence>;
}
