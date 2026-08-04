"use client";

import { IconAlertTriangle, IconX } from "@tabler/icons-react";
import type { WindchillChangeImpactFilter, WindchillChangeImpactResult } from "@/types/windchill-change-impact";

export function WindchillChangeImpactSummary({ result, filter, onFilterChange, onClose }: { result: WindchillChangeImpactResult; filter: WindchillChangeImpactFilter; onFilterChange: (filter: WindchillChangeImpactFilter) => void; onClose: () => void }) {
  const cards = [
    [result.summary.changeNotices, "Change Notices"],
    [result.summary.affectedParts, "Affected Parts"],
    [result.summary.affectedOccurrences, "Affected Occurrences"],
    [result.summary.impactedAssemblies, "Impacted Assemblies"],
  ] as const;
  return (
    <section className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-400/[.06] p-4">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-amber-500">Associated Windchill changes</p><h3 className="mt-1 text-sm font-semibold">{result.product.partNumber ?? result.product.partName ?? "Loaded product"}</h3></div>
        <button type="button" aria-label="Clear associated changes" onClick={onClose}><IconX className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{cards.map(([value, label]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 text-center dark:border-slate-700 dark:bg-slate-900"><b className="block text-lg text-amber-500">{value}</b><span className="text-[10px] uppercase text-slate-500">{label}</span></div>)}</div>
      <div className="mt-3 flex flex-wrap gap-2">{(["all", "direct", "indirect"] as WindchillChangeImpactFilter[]).map((value) => <button key={value} type="button" onClick={() => onFilterChange(value)} className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${filter === value ? "border-amber-500 bg-amber-500 text-white" : "border-slate-300 dark:border-slate-700"}`}>{value === "direct" ? "Affected parts" : value === "indirect" ? "Impacted assemblies" : "All BOM items"}</button>)}</div>
      <div className="mt-3 space-y-2">{result.changeNotices.map((notice) => <details key={notice.id ?? notice.number ?? notice.name ?? "notice"} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><summary className="cursor-pointer text-sm font-semibold">CN {notice.number ?? "Unknown"} · {notice.name ?? "Unnamed change"} <span className="ml-2 text-xs font-normal text-slate-500">{notice.state ?? "Unknown state"}</span></summary><p className="mt-2 text-xs text-slate-500">{notice.description || notice.descriptionSummary || "No description provided for this Change Notice."}</p><div className="mt-2 space-y-1">{notice.affectedParts.map((part) => <p key={`${notice.id}-${part.partId}`} className="text-xs"><IconAlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-500" />{part.partNumber} · {part.partName} · {part.version ?? part.revision ?? "Version unavailable"}{part.changeIntent ? ` · ${part.changeIntent}` : ""}</p>)}</div></details>)}</div>
      {result.warnings.length ? <p className="mt-3 text-xs text-amber-600">Partial scan: {result.warnings.length} lookup warning(s).</p> : null}
    </section>
  );
}
