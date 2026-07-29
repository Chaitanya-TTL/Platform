"use client";
import { IconListSearch } from "@tabler/icons-react";
import { openRequirementsExplorer } from "@/lib/requirement-trace-store";
export function RequirementsExplorerButton({ count }: { count: number }) {
  return (
    <button
      type="button"
      onClick={openRequirementsExplorer}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-[10px] font-semibold text-slate-500 transition hover:border-violet-400/50 hover:text-violet-600 dark:border-slate-700 dark:hover:text-violet-300"
    >
      <IconListSearch className="h-4 w-4" />
      Requirements
      <span className="rounded-full bg-violet-400/10 px-1.5 text-violet-500">
        {count}
      </span>
    </button>
  );
}
