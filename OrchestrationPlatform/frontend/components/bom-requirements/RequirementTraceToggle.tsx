"use client";
import { IconGitBranch } from "@tabler/icons-react";
import { setImpactEnabled } from "@/lib/cross-bom-impact-store";
import { setRequirementTraceEnabled } from "@/lib/requirement-trace-store";
export function RequirementTraceToggle({ enabled, count = 0 }: { enabled: boolean; count?: number }) {
  return <button type="button" onClick={() => { if (!enabled) setImpactEnabled(false); setRequirementTraceEnabled(!enabled); }} className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[10px] font-semibold ${enabled ? "border-violet-400/40 bg-violet-500/15 text-violet-300" : "border-slate-300 text-slate-500 dark:border-slate-700"}`}>
    <IconGitBranch className="h-4 w-4" /> Trace {enabled ? "ON" : "OFF"}
    {enabled && count > 0 ? <span className="rounded-full bg-violet-400/15 px-1.5">{count}</span> : null}
  </button>;
}
