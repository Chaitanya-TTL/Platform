"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { IconArrowLeft, IconArrowsExchange } from "@tabler/icons-react";
import type { SourceType } from "@/types/bom-comparison";

type ComparisonLoaderMode = "enter" | "exit";

const enterStages = [
  "Normalizing source structures",
  "Matching business identifiers",
  "Evaluating hierarchy and differences",
  "Preparing explainable results",
];

const exitStages = [
  "Restoring extracted structures",
  "Restoring source-card layout",
  "Removing comparison annotations",
  "Preparing independent BOM views",
];

export function ComparisonLoader({
  mode,
  left,
  right,
  labels,
  onComplete,
}: {
  mode: ComparisonLoaderMode;
  left?: SourceType;
  right?: SourceType;
  labels: Record<SourceType, string>;
  onComplete: () => void;
}) {
  const stages = useMemo(
    () => (mode === "enter" ? enterStages : exitStages),
    [mode],
  );
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    setStageIndex(0);

    const stageTimer = window.setInterval(() => {
      setStageIndex((current) => Math.min(stages.length - 1, current + 1));
    }, 700);

    const completionTimer = window.setTimeout(onComplete, 3000);

    return () => {
      window.clearInterval(stageTimer);
      window.clearTimeout(completionTimer);
    };
  }, [mode, onComplete, stages]);

  const entering = mode === "enter";
  const Icon = entering ? IconArrowsExchange : IconArrowLeft;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950 text-white"
      role="status"
      aria-live="polite"
      aria-label={
        entering ? "Preparing BOM comparison" : "Returning to source workspace"
      }
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.16),transparent_40%)]" />

      <div className="relative max-w-lg px-6 text-center">
        <motion.div
          animate={entering ? { rotate: [0, 180, 360] } : { x: [0, -8, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-[24px] border border-cyan-400/25 bg-cyan-400/[0.08] text-cyan-300 shadow-[0_0_70px_rgba(34,211,238,0.18)]"
        >
          <Icon className="h-8 w-8" />
        </motion.div>

        <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-300">
          {entering
            ? "Preparing cross-source comparison"
            : "Returning to Orchestration Platform"}
        </p>

        <h2 className="mt-3 text-3xl font-semibold">
          {entering && left && right
            ? `${labels[left]} ↔ ${labels[right]}`
            : "Restoring your platform"}
        </h2>

        <p className="mt-5 text-sm text-slate-400">{stages[stageIndex]}</p>

        <div className="mx-auto mt-6 h-1.5 w-64 overflow-hidden rounded-full bg-slate-800">
          <motion.div
            className="h-full rounded-full bg-cyan-400"
            animate={{ width: `${((stageIndex + 1) / stages.length) * 100}%` }}
            transition={{ duration: 0.35 }}
          />
        </div>

        <p className="mt-3 text-[10px] text-slate-600">
          {entering
            ? "Existing BOMs remain loaded. No extraction is being rerun."
            : "Your extracted BOMs, source order, and viewing state are being restored."}
        </p>
      </div>
    </motion.div>
  );
}
