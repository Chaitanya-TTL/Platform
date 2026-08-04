"use client";

import { IconFocus2, IconRoute, IconSparkles, IconX } from "@tabler/icons-react";
import type { WindchillChangeImpactFilter, WindchillChangeImpactResult } from "@/types/windchill-change-impact";

type Props = {
  result: WindchillChangeImpactResult;
  enabled: boolean;
  filter: WindchillChangeImpactFilter;
  isolate: boolean;
  selectedNotice?: string;
  onToggle: () => void;
  onFilter: (value: WindchillChangeImpactFilter) => void;
  onIsolate: () => void;
  onNotice: (value?: string) => void;
  onFocus: () => void;
  onCloseSelection: () => void;
};

export function BomThreeChangeIntelligence(props: Props) {
  const notices = props.result.changeNotices;
  return (
    <aside className="absolute left-4 top-20 z-40 w-[min(390px,calc(100%-2rem))] overflow-hidden rounded-2xl border border-amber-400/25 bg-slate-950/95 shadow-2xl backdrop-blur-xl">
      <div className="border-b border-amber-400/15 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-amber-300"><IconSparkles className="h-4 w-4" />Change Intelligence</p>
            <h3 className="mt-2 text-base font-semibold text-white">Engineering change universe</h3>
            <p className="mt-1 text-xs text-slate-400">Authoritative Windchill Change Notice impact across this BOM.</p>
          </div>
          <button type="button" onClick={props.onCloseSelection} title="Clear selected change" className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-white"><IconX className="h-4 w-4" /></button>
        </div>
        <button type="button" onClick={props.onToggle} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold uppercase tracking-wider ${props.enabled ? "border-amber-400/50 bg-amber-400/15 text-amber-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}>
          <IconSparkles className="h-4 w-4" />{props.enabled ? "Change mode active" : "Activate change mode"}
        </button>
      </div>

      {props.enabled ? <div className="space-y-3 p-4">
        <div className="grid grid-cols-4 gap-2">
          {[
            [props.result.summary.changeNotices, "Notices"],
            [props.result.summary.affectedParts, "Parts"],
            [props.result.summary.affectedOccurrences, "Direct"],
            [props.result.summary.impactedAssemblies, "Parents"],
          ].map(([value, label]) => <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900/70 p-2 text-center"><b className="block text-base text-amber-300">{value}</b><span className="text-[9px] uppercase text-slate-500">{label}</span></div>)}
        </div>

        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Change Notice</label>
        <select value={props.selectedNotice ?? ""} onChange={(event) => props.onNotice(event.target.value || undefined)} className="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-white outline-none focus:border-amber-400">
          <option value="">All associated notices</option>
          {notices.map((notice) => <option key={notice.id ?? notice.number ?? notice.name ?? "change"} value={notice.id ?? notice.number ?? ""}>CN {notice.number ?? "Unknown"} · {notice.name ?? "Unnamed change"}</option>)}
        </select>

        <div className="grid grid-cols-3 gap-2">
          {(["all", "direct", "indirect"] as WindchillChangeImpactFilter[]).map((value) => <button key={value} type="button" onClick={() => props.onFilter(value)} className={`rounded-xl border px-2 py-2 text-[10px] font-semibold uppercase ${props.filter === value ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-slate-700 text-slate-400"}`}>{value === "direct" ? "Affected" : value === "indirect" ? "Parents" : "All"}</button>)}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={props.onIsolate} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${props.isolate ? "border-orange-400 bg-orange-400/15 text-orange-200" : "border-slate-700 text-slate-300"}`}><IconRoute className="h-4 w-4" />{props.isolate ? "Isolated" : "Isolate change"}</button>
          <button type="button" onClick={props.onFocus} className="flex items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200"><IconFocus2 className="h-4 w-4" />Frame impact</button>
        </div>

        <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
          {notices.filter((notice) => !props.selectedNotice || notice.id === props.selectedNotice || notice.number === props.selectedNotice).map((notice) => <div key={notice.id ?? notice.number ?? notice.name ?? "notice"} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><div className="flex items-center justify-between gap-2"><b className="truncate text-xs text-white">CN {notice.number ?? "Unknown"} · {notice.name ?? "Unnamed change"}</b><span className="shrink-0 rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] font-bold uppercase text-emerald-300">{notice.state ?? "Unknown"}</span></div><p className="mt-2 line-clamp-2 text-[10px] leading-4 text-slate-400">{notice.description || notice.descriptionSummary || "No description provided for this Change Notice."}</p><p className="mt-2 text-[10px] text-amber-300">{notice.affectedParts.length} affected part{notice.affectedParts.length === 1 ? "" : "s"} · {notice.tasks.length} task{notice.tasks.length === 1 ? "" : "s"}</p></div>)}
        </div>
      </div> : null}
    </aside>
  );
}
