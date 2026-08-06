"use client";

import { IconAlertTriangle, IconX } from "@tabler/icons-react";
import type { WindchillChangeImpactFilter, WindchillChangeImpactResult } from "@/types/windchill-change-impact";

export function WindchillChangeWorkspace({ result, filter, onFilterChange, onClose }: {
  result: WindchillChangeImpactResult;
  filter: WindchillChangeImpactFilter;
  onFilterChange: (value: WindchillChangeImpactFilter) => void;
  onClose: () => void;
}) {
  return (
    <section className="mt-3 rounded-xl border border-slate-800 bg-slate-950/55 p-3">
      <header className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Associated changes</h3>
          <p className="mt-1 text-[11px] text-slate-500">{result.summary.changeNotices} notices · {result.summary.affectedOccurrences} affected · {result.summary.impactedAssemblies} impacted</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white"><IconX className="h-4 w-4" /></button>
      </header>
      <div className="mt-3 flex gap-1">
        {([ ["all", "All"], ["direct", "Affected"], ["indirect", "Impacted"] ] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => onFilterChange(value)} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${filter === value ? "bg-slate-100 text-slate-950" : "text-slate-500 hover:bg-slate-800 hover:text-slate-200"}`}>{label}</button>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        {result.changeNotices.length ? result.changeNotices.map((notice) => (
          <article key={notice.id ?? notice.number ?? notice.name ?? "notice"} className="rounded-lg border border-slate-800 bg-slate-900/45 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-200">CN {notice.number ?? "Unknown"} · {notice.name ?? "Unnamed change"}</p><p className="mt-1 text-[10px] text-slate-600">{notice.affectedParts.length} affected parts · {notice.tasks.length} tasks</p></div>
              <span className="shrink-0 text-[9px] font-semibold uppercase text-slate-500">{notice.state ?? "Unknown"}</span>
            </div>
            {notice.affectedParts.length ? <div className="mt-3 space-y-1 border-t border-slate-800 pt-2">{notice.affectedParts.map((part) => <p key={`${notice.id}-${part.partId}`} className="truncate text-[10px] text-slate-400"><span className="text-amber-400">Affected</span> · {part.partNumber ?? part.partId}{part.partName ? ` · ${part.partName}` : ""}{part.version || part.revision ? ` · ${part.version || part.revision}` : ""}{part.changeIntent ? ` · ${part.changeIntent}` : ""}</p>)}</div> : null}
          </article>
        )) : <p className="py-3 text-xs text-slate-500">No associated Change Notices.</p>}
      </div>
      {result.warnings.length ? <div className="mt-3 flex gap-2 border-t border-slate-800 pt-3 text-[10px] text-amber-400"><IconAlertTriangle className="h-3.5 w-3.5 shrink-0" />Partial result · {result.warnings.length} lookup warnings</div> : null}
    </section>
  );
}
