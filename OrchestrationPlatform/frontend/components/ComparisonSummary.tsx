"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  IconArrowsExchange,
  IconChevronDown,
  IconFileTypeCsv,
  IconInfoCircle,
  IconJson,
  IconPlus,
} from "@tabler/icons-react";
import { downloadMultiComparison } from "@/lib/bom-comparison";
import type {
  ComparisonFilter,
  MultiBomComparisonResult,
  SourceType,
} from "@/types/bom-comparison";
const names: Record<ComparisonFilter, string> = {
  all: "All",
  matched: "Matched",
  changed: "Changed",
  missing: "Missing",
  "source-only": "Source-only",
  probable: "Review",
};
const colors: Record<ComparisonFilter, string> = {
  all: "bg-slate-900 text-white dark:bg-white dark:text-slate-950",
  matched: "bg-emerald-500 text-white",
  changed: "bg-amber-500 text-slate-950",
  missing: "bg-rose-500 text-white",
  "source-only": "bg-sky-500 text-white",
  probable: "bg-violet-500 text-white",
};
export function ComparisonSummary({
  result,
  filter,
  onFilterChange,
  sourceLabels,
  canAddSource,
  onAddSource,
}: {
  result: MultiBomComparisonResult;
  filter: ComparisonFilter;
  onFilterChange: (f: ComparisonFilter) => void;
  sourceLabels: Record<SourceType, string>;
  canAddSource: boolean;
  onAddSource: () => void;
}) {
  const [open, setOpen] = useState(false),
    s = result.summary,
    counts: Record<ComparisonFilter, number> = {
      all: s.total + s.sourceOnly,
      matched: s.matched,
      changed: s.changed,
      missing: s.missing,
      "source-only": s.sourceOnly,
      probable: s.probable,
    };
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/85 sm:p-5"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-400/[.08] dark:text-cyan-300">
            <IconArrowsExchange className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-cyan-600 dark:text-cyan-400">
              Cross-source comparison
            </p>
            <h2 className="mt-1 text-sm font-semibold">
              {sourceLabels[result.primarySource]} compared with{" "}
              {result.comparedSources.map((s) => sourceLabels[s]).join(" + ")}
            </h2>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(names) as ComparisonFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
              className={[
                "inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold",
                filter === f
                  ? colors[f]
                  : "border-slate-200 dark:border-slate-700",
              ].join(" ")}
            >
              {names[f]} <span className="opacity-70">{counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {canAddSource ? (
            <button
              onClick={onAddSource}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-600 text-white"
              title="Add another BOM"
              aria-label="Add another BOM"
            >
              <IconPlus className="h-5 w-5" />
            </button>
          ) : null}
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold dark:border-slate-700"
          >
            <IconInfoCircle className="h-4 w-4" />
            How it works
            <IconChevronDown
              className={`h-3.5 w-3.5 ${open ? "rotate-180" : ""}`}
            />
          </button>
          <button
            onClick={() => downloadMultiComparison(result, "json")}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold dark:border-slate-700"
          >
            <IconJson className="h-4 w-4" />
            JSON
          </button>
          <button
            onClick={() => downloadMultiComparison(result, "csv")}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold dark:border-slate-700"
          >
            <IconFileTypeCsv className="h-4 w-4" />
            CSV
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 grid gap-5 border-t border-slate-200 pt-4 dark:border-slate-700 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">
                  How multi-BOM comparison works
                </h3>
                <ol className="mt-3 space-y-2 text-xs leading-5 text-slate-500">
                  <li>
                    <b>1. Primary source:</b> the first selected BOM remains the
                    comparison anchor.
                  </li>
                  <li>
                    <b>2. Pairwise evaluation:</b> every added BOM is
                    independently compared against the primary source.
                  </li>
                  <li>
                    <b>3. Primary-line status:</b> the primary BOM shows the
                    most significant status across all included comparisons.
                  </li>
                  <li>
                    <b>4. Per-source reasoning:</b> each secondary BOM keeps its
                    own exact explanation against the primary.
                  </li>
                  <li>
                    <b>5. Exports:</b> JSON and CSV include every pairwise
                    result.
                  </li>
                </ol>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Included sources</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[result.primarySource, ...result.comparedSources].map(
                    (s) => (
                      <span
                        key={s}
                        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700"
                      >
                        {sourceLabels[s]}
                      </span>
                    ),
                  )}
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  Hover a status badge for a concise reason. Select a row for
                  complete reasoning.
                </p>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.section>
  );
}
