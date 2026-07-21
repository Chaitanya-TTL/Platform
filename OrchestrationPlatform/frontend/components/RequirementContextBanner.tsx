"use client";

import { motion } from "motion/react";
import { IconSitemap, IconSparkles } from "@tabler/icons-react";
import type { RequirementContext } from "@/lib/requirement-context";

export function RequirementContextBanner({
  requirement,
}: {
  requirement?: RequirementContext | null;
}) {
  if (!requirement) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      className="mb-3 overflow-hidden rounded-2xl border border-violet-300/70 bg-gradient-to-r from-violet-50 via-indigo-50 to-cyan-50 shadow-sm dark:border-violet-400/25 dark:from-violet-500/[.10] dark:via-indigo-500/[.07] dark:to-cyan-500/[.05]"
      aria-label="ALM requirement context"
    >
      <div className="flex items-start gap-3 px-3.5 py-3.5 sm:px-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-white/80 text-violet-700 shadow-sm dark:border-violet-400/20 dark:bg-violet-400/[.10] dark:text-violet-300">
          <IconSitemap className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-700 dark:text-violet-300">
              ALM Requirement
            </p>
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white/70 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-violet-600 dark:border-violet-400/20 dark:bg-slate-950/30 dark:text-violet-300">
              <IconSparkles className="h-3 w-3" />
              {requirement.mode === "simulated" ? "Simulated" : "Live"}
            </span>
          </div>
          <p className="mt-1.5 text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100">
            Requirement: {requirement.title}
          </p>
          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
            Source: {requirement.source}
          </p>
        </div>
      </div>
    </motion.section>
  );
}
