"use client";
import { useEffect, type MouseEvent } from "react";
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
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
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
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15 }}
            role="dialog"
            aria-modal="true"
            className="w-full rounded-t-[28px] border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:max-w-md sm:rounded-[28px] sm:p-7"
          >
            <div className="flex justify-between">
              <div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-400/[.08] dark:text-cyan-300">
                  <IconPlus className="h-5 w-5" />
                </span>
                <h2 className="mt-4 text-xl font-semibold">
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
                    className="flex items-center justify-between rounded-2xl border border-slate-200 p-4 text-left font-semibold transition hover:border-cyan-400 hover:bg-cyan-50 dark:border-slate-700 dark:hover:bg-cyan-400/[.06]"
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
