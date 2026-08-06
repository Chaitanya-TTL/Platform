"use client";

import { IconBox, IconChevronRight, IconHierarchy, IconRoute } from "@tabler/icons-react";
import type { WindchillChangeImpactResult } from "@/types/windchill-change-impact";
import type { ReviewImpactRecord } from "@/lib/windchill-change-review";

export function WindchillChangeMapView({ result, records, selectedId, onSelect }: {
  result: WindchillChangeImpactResult | null;
  records: ReviewImpactRecord[];
  selectedId?: string;
  onSelect: (record: ReviewImpactRecord) => void;
}) {
  const direct = records.filter((record) => record.impact.impact === "direct");
  if (!result || !direct.length) return <div className="flex min-h-[360px] items-center justify-center border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">Load Change Management evidence to build the propagation map.</div>;
  const notice = result.changeNotices[0];
  return <div className="min-h-[420px] overflow-auto">
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4"><span className="flex h-10 w-10 items-center justify-center rounded-lg border border-orange-400/40 bg-orange-400/10 text-orange-300"><IconRoute className="h-5 w-5" /></span><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-orange-300">Authoritative source</p><h4 className="text-base font-semibold text-white">CN {notice?.number ?? "Unknown"} · {notice?.name ?? "Associated change"}</h4><p className="mt-1 text-xs text-slate-500">{notice?.state ?? "Lifecycle state unavailable"}</p></div></div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">{direct.map((record, recordIndex) => <button key={record.nodeId} type="button" onClick={() => onSelect(record)} className={`group min-w-0 border p-4 text-left transition ${selectedId === record.nodeId ? "border-orange-400/50 bg-orange-400/[.06]" : "border-slate-800 bg-slate-950/40 hover:border-slate-700"}`}><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-full border border-orange-400/40 text-orange-300"><IconBox className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{record.name}</p><p className="text-[10px] uppercase tracking-wide text-orange-300">Affected occurrence {recordIndex + 1}</p></div></div><div className="mt-4 flex flex-wrap items-center gap-2">{record.path.map((name,index) => <div key={`${record.nodeId}-${index}`} className="flex items-center gap-2"><span className={`max-w-[180px] truncate rounded-md border px-2.5 py-1.5 text-[10px] ${index === record.path.length - 1 ? "border-orange-400/40 bg-orange-400/10 text-orange-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}>{index === record.path.length - 1 ? <IconBox className="mr-1 inline h-3 w-3" /> : <IconHierarchy className="mr-1 inline h-3 w-3" />}{name}</span>{index < record.path.length - 1 ? <IconChevronRight className="h-3.5 w-3.5 text-slate-700" /> : null}</div>)}</div></button>)}</div>
    </div>
  </div>;
}
