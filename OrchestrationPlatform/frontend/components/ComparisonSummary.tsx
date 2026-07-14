"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  IconArrowsExchange,
  IconChevronDown,
  IconFileTypeCsv,
  IconInfoCircle,
  IconJson,
} from "@tabler/icons-react";
import { downloadComparison } from "@/lib/bom-comparison";
import type {
  BomComparisonResult,
  ComparisonFilter,
  SourceType,
} from "@/types/bom-comparison";

const labels: Record<ComparisonFilter, string> = {
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
}: {
  result: BomComparisonResult;
  filter: ComparisonFilter;
  onFilterChange: (filter: ComparisonFilter) => void;
  sourceLabels: Record<SourceType, string>;
}) {
  const [open, setOpen] = useState(false);
  const counts: Record<ComparisonFilter, number> = {
    all: result.summary.total + result.summary.sourceOnly,
    matched: result.summary.matched,
    changed: result.summary.changed,
    missing: result.summary.missing,
    "source-only": result.summary.sourceOnly,
    probable: result.summary.probable,
  };
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/85 sm:p-5"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-400/[0.08] dark:text-cyan-300">
            <IconArrowsExchange className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-600 dark:text-cyan-400">
              Cross-source comparison
            </p>
            <h2 className="mt-1 truncate text-sm font-semibold sm:text-base">
              {sourceLabels[result.leftSource]} ↔{" "}
              {sourceLabels[result.rightSource]}
            </h2>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(labels) as ComparisonFilter[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onFilterChange(item)}
              aria-pressed={filter === item}
              className={[
                "inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition",
                filter === item
                  ? colors[item]
                  : "border-slate-200 bg-white text-slate-600 hover:border-cyan-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300",
              ].join(" ")}
            >
              {labels[item]} <span className="opacity-70">{counts[item]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold dark:border-slate-700"
          >
            <IconInfoCircle className="h-4 w-4" /> How it works{" "}
            <IconChevronDown
              className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`}
            />
          </button>
          <button
            type="button"
            onClick={() => downloadComparison(result, "json")}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold dark:border-slate-700"
          >
            <IconJson className="h-4 w-4" /> JSON
          </button>
          <button
            type="button"
            onClick={() => downloadComparison(result, "csv")}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold dark:border-slate-700"
          >
            <IconFileTypeCsv className="h-4 w-4" /> CSV
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
            <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 dark:border-slate-700 lg:grid-cols-[1.3fr_1fr]">
              <div>
                <h3 className="text-sm font-semibold">
                  How the comparison is calculated
                </h3>
                <ol className="mt-3 space-y-2 text-xs leading-5 text-slate-500">
                  <li>
                    <b className="text-slate-700 dark:text-slate-300">
                      1. Item ID first:
                    </b>{" "}
                    exact normalized business identifiers receive 100% match
                    confidence.
                  </li>
                  <li>
                    <b className="text-slate-700 dark:text-slate-300">
                      2. Context fallback:
                    </b>{" "}
                    when IDs differ, normalized name, parent, hierarchy level,
                    and assembly/leaf type are scored.
                  </li>
                  <li>
                    <b className="text-slate-700 dark:text-slate-300">
                      3. Differences:
                    </b>{" "}
                    name, quantity, revision, and parent are compared when both
                    values exist.
                  </li>
                  <li>
                    <b className="text-slate-700 dark:text-slate-300">
                      4. Missing data:
                    </b>{" "}
                    an absent quantity, revision, or parent on one side is not
                    automatically treated as a mismatch.
                  </li>
                  <li>
                    <b className="text-slate-700 dark:text-slate-300">
                      5. Review matches:
                    </b>{" "}
                    lower-confidence name matches are marked for manual review
                    rather than silently accepted.
                  </li>
                </ol>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Result legend</h3>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <Legend color="bg-emerald-500" text="Matched" />
                  <Legend color="bg-amber-500" text="Changed" />
                  <Legend color="bg-rose-500" text="Missing" />
                  <Legend color="bg-sky-500" text="Source-only" />
                  <Legend color="bg-violet-500" text="Review match" />
                </div>
                <p className="mt-4 text-[11px] leading-5 text-slate-500">
                  Hover or focus any highlighted BOM row to see a concise
                  justification. Select the row to view the full field-by-field
                  reasoning.
                </p>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.section>
  );
}
function Legend({ color, text }: { color: string; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2 dark:border-slate-700">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {text}
    </div>
  );
}
