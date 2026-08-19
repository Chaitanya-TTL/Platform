"use client";
import { useEffect, useRef, type MouseEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconPlus, IconX } from "@tabler/icons-react";
import type { SourceType } from "@/types/bom-comparison";
export function AddComparisonSourceModal({
  open,
  availableSources,
  labels,
  onClose,
  onAdd,
}: {
  open: boolean;
  availableSources: SourceType[];
  labels: Record<SourceType, string>;
  onClose: () => void;
  onAdd: (source: SourceType) => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    previous.current = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && dialog.current) {
        const items = [...dialog.current.querySelectorAll<HTMLElement>("button:not([disabled]),a[href]")];
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    addEventListener("keydown", key);
    requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>("button")?.focus());
    return () => { document.body.style.overflow = old; removeEventListener("keydown", key); previous.current?.focus(); };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open ? (
        <div
          className="fixed inset-0 z-[125] flex items-end justify-center bg-slate-950/75 backdrop-blur-sm sm:items-center sm:p-6"
          onMouseDown={(e: MouseEvent<HTMLDivElement>) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={dialog}
            aria-labelledby="add-comparison-title"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15 }}
            role="dialog"
            aria-modal="true"
            className="w-full rounded-t-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:max-w-md sm:rounded-2xl sm:p-7"
          >
            <div className="flex justify-between">
              <div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-400/[.08] dark:text-cyan-300">
                  <IconPlus className="h-5 w-5" />
                </span>
                <h2 id="add-comparison-title" className="mt-4 text-xl font-semibold">
                  Add BOM to comparison
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Select a remaining ready source. Extraction will not run
                  again.
                </p>
              </div>
              <button onClick={onClose}>
                <IconX className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 grid gap-3">
              {availableSources.length ? (
                availableSources.map((s) => (
                  <button
                    key={s}
                    onClick={() => onAdd(s)}
                    className="flex items-center justify-between rounded-xl border border-slate-200 p-4 text-left font-semibold transition hover:border-cyan-400 hover:bg-cyan-50 dark:border-slate-700 dark:hover:bg-cyan-400/[.06]"
                  >
                    <span>{labels[s]}</span>
                    <IconPlus className="h-5 w-5 text-cyan-600" />
                  </button>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">
                  All ready BOMs are already included.
                </p>
              )}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
