"use client";
import { IconAlertTriangle, IconCircleCheck, IconClock, IconInfoCircle, IconRefresh } from "@tabler/icons-react";

export type SourceViewStatus = "idle" | "loading" | "ready" | "empty" | "error";
const config = {
  idle: { label: "Waiting", icon: IconClock, cls: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400" },
  loading: { label: "Retrieving", icon: IconRefresh, cls: "border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300" },
  ready: { label: "Ready", icon: IconCircleCheck, cls: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" },
  empty: { label: "No structure", icon: IconInfoCircle, cls: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400" },
  error: { label: "Needs attention", icon: IconAlertTriangle, cls: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300" },
} as const;

export function SourceStateBadge({ status }: { status: SourceViewStatus }) {
  const item = config[status];
  return <span className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold ${item.cls}`}><item.icon className={`h-3.5 w-3.5 ${status === "loading" ? "animate-spin" : ""}`} />{item.label}</span>;
}

export function SourceStructureSkeleton({ label, progress }: { label: string; progress?: number | null }) {
  return (
    <div className="min-h-[340px] p-5 sm:p-6" aria-live="polite" aria-busy="true">
      <div className="flex items-center justify-between gap-4">
        <div><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p><p className="mt-1 text-xs text-slate-500">Preparing the source structure and engineering context.</p></div>
        {progress != null ? <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-300">{Math.round(progress)}%</span> : null}
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${progress == null ? 24 : Math.max(4, Math.min(100, progress))}%` }} /></div>
      <div className="mt-6 space-y-3">
        {[92, 78, 86, 64, 72].map((width, index) => <div key={width} className="flex items-center gap-3" style={{ paddingLeft: `${Math.min(index, 3) * 18}px` }}><span className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800"/><span className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" style={{ width: `${width}%` }}/></div>)}
      </div>
    </div>
  );
}
