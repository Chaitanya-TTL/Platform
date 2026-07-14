"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconArrowsExchange, IconCheck, IconX } from "@tabler/icons-react";
import type { ComparisonSelection, SourceType } from "@/types/bom-comparison";
export function ComparisonSetupModal({
  open,
  readySources,
  labels,
  initialSelection,
  onClose,
  onStart,
}: {
  open: boolean;
  readySources: SourceType[];
  labels: Record<SourceType, string>;
  initialSelection: ComparisonSelection | null;
  onClose: () => void;
  onStart: (selection: ComparisonSelection) => void;
}) {
  const [first, setFirst] = useState<SourceType>(
      initialSelection?.leftSource ?? readySources[0],
    ),
    [second, setSecond] = useState<SourceType>(
      initialSelection?.rightSource ??
        readySources.find((x) => x !== readySources[0]) ??
        readySources[0],
    ),
    dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setFirst(initialSelection?.leftSource ?? readySources[0]);
    setSecond(
      initialSelection?.rightSource ??
        readySources.find((x) => x !== readySources[0]) ??
        readySources[0],
    );
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    addEventListener("keydown", key);
    requestAnimationFrame(() =>
      dialog.current?.querySelector<HTMLElement>("select")?.focus(),
    );
    return () => {
      document.body.style.overflow = old;
      removeEventListener("keydown", key);
    };
  }, [open, readySources.join("|"), initialSelection, onClose]);
  const valid =
    first !== second &&
    readySources.includes(first) &&
    readySources.includes(second);
  return (
    <AnimatePresence>
      {open ? (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onMouseDown={(e: { target: any; currentTarget: any }) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="compare-title"
            initial={{ opacity: 0, y: 25, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20 }}
            className="w-full rounded-t-[28px] border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:max-w-xl sm:rounded-[28px] sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-400/[.08] dark:text-cyan-300">
                  <IconArrowsExchange className="h-5 w-5" />
                </span>
                <h2 id="compare-title" className="mt-4 text-2xl font-semibold">
                  Choose BOMs to compare
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Select two ready structures. Existing extraction results
                  remain loaded.
                </p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close">
                <IconX className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Source A
                <select
                  value={first}
                  onChange={(e: { target: { value: any } }) =>
                    setFirst(e.target.value as SourceType)
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm normal-case text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  {readySources.map((s) => (
                    <option key={s} value={s}>
                      {labels[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Source B
                <select
                  value={second}
                  onChange={(e: { target: { value: any } }) =>
                    setSecond(e.target.value as SourceType)
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm normal-case text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  {readySources.map((s) => (
                    <option key={s} value={s}>
                      {labels[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {first === second ? (
              <p className="mt-3 text-xs text-rose-600">
                Choose two different sources.
              </p>
            ) : null}
            <div className="mt-5 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs font-semibold">Ready sources</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {readySources.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 dark:bg-emerald-400/[.08] dark:text-emerald-300"
                  >
                    <IconCheck className="h-3.5 w-3.5" />
                    {labels[s]}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!valid}
                onClick={() =>
                  onStart({ leftSource: first, rightSource: second })
                }
                className="h-10 rounded-xl bg-cyan-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Start comparison
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
