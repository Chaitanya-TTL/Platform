"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  IconArrowLeft,
  IconArrowsExchange,
  IconPlus,
} from "@tabler/icons-react";
import type { SourceType } from "@/types/bom-comparison";
type Mode = "enter" | "exit" | "add";
const stages = {
  enter: [
    "Normalizing source structures",
    "Matching business identifiers",
    "Evaluating hierarchy and differences",
    "Preparing explainable results",
  ],
  exit: [
    "Restoring extracted structures",
    "Restoring source-card layout",
    "Removing comparison annotations",
    "Preparing independent BOM views",
  ],
  add: [
    "Loading the ready BOM into the comparison",
    "Matching against the primary source",
    "Updating explanations and filters",
    "Preparing the expanded comparison",
  ],
};
export function ComparisonLoader({
  mode,
  left,
  right,
  addedSource,
  labels,
  onComplete,
}: {
  mode: Mode;
  left?: SourceType;
  right?: SourceType;
  addedSource?: SourceType;
  labels: Record<SourceType, string>;
  onComplete: () => void;
}) {
  const list = useMemo(() => stages[mode], [mode]),
    [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
    const a = setInterval(
        () => setIndex((v) => Math.min(list.length - 1, v + 1)),
        700,
      ),
      b = setTimeout(onComplete, mode === "add" ? 2200 : 3000);
    return () => {
      clearInterval(a);
      clearTimeout(b);
    };
  }, [mode, onComplete, list]);
  const Icon =
    mode === "exit"
      ? IconArrowLeft
      : mode === "add"
        ? IconPlus
        : IconArrowsExchange;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950 text-white"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,.16),transparent_40%)]" />
      <div className="relative px-6 text-center">
        <motion.div
          animate={
            mode === "exit" ? { x: [0, -8, 0] } : { rotate: [0, 180, 360] }
          }
          transition={{ duration: 2.3, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-[24px] border border-cyan-400/25 bg-cyan-400/[.08] text-cyan-300"
        >
          <Icon className="h-8 w-8" />
        </motion.div>
        <p className="mt-7 text-[11px] font-semibold uppercase tracking-[.25em] text-cyan-300">
          {mode === "exit"
            ? "Returning to Orchestration Platform"
            : mode === "add"
              ? "Expanding comparison"
              : "Preparing cross-source comparison"}
        </p>
        <h2 className="mt-3 text-3xl font-semibold">
          {mode === "add" && addedSource
            ? `Adding ${labels[addedSource]}`
            : mode === "enter" && left && right
              ? `${labels[left]} ↔ ${labels[right]}`
              : "Restoring your platform"}
        </h2>
        <p className="mt-5 text-sm text-slate-400">{list[index]}</p>
        <div className="mx-auto mt-6 h-1.5 w-64 overflow-hidden rounded-full bg-slate-800">
          <motion.div
            className="h-full bg-cyan-400"
            animate={{ width: `${((index + 1) / list.length) * 100}%` }}
          />
        </div>
        <p className="mt-3 text-[10px] text-slate-600">
          Existing extraction results remain loaded. No extraction is being
          rerun.
        </p>
      </div>
    </motion.div>
  );
}
