"use client";

import { IconFocus2, IconRoute, IconX } from "@tabler/icons-react";
import type { WindchillChangeImpactFilter, WindchillChangeImpactResult } from "@/types/windchill-change-impact";

type Props = {
  result: WindchillChangeImpactResult;
  enabled: boolean;
  filter: WindchillChangeImpactFilter;
  isolate: boolean;
  activeCount: number;
  selectedNotice?: string;
  onToggle: () => void;
  onFilter: (value: WindchillChangeImpactFilter) => void;
  onIsolate: () => void;
  onNotice: (value?: string) => void;
  onFocus: () => void;
  onCloseSelection: () => void;
};
const filters: Array<{ value: WindchillChangeImpactFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "direct", label: "Affected" },
  { value: "indirect", label: "Parents" },
];
export function BomThreeChangeControls(props: Props) {
  const unavailable = props.enabled && props.activeCount === 0;
  return <aside className="absolute left-4 top-20 z-40 w-[min(330px,calc(100%-2rem))] rounded-xl border border-slate-700/80 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-xl">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0"><h3 className="text-xs font-semibold text-slate-100">Change impact</h3><p className="mt-0.5 truncate text-[10px] text-slate-500">{props.result.summary.affectedOccurrences} affected · {props.result.summary.impactedAssemblies} parents</p></div>
      <div className="flex items-center gap-1.5"><button type="button" aria-label={props.enabled ? "Disable Change Impact" : "Enable Change Impact"} aria-pressed={props.enabled} onClick={props.onToggle} className={`relative h-6 w-11 rounded-full transition ${props.enabled ? "bg-orange-500" : "bg-slate-700"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${props.enabled ? "left-6" : "left-1"}`}/></button><button type="button" onClick={props.onCloseSelection} aria-label="Clear selected Change Notice" className="rounded-md p-1 text-slate-600 hover:bg-slate-800 hover:text-slate-300"><IconX className="h-3.5 w-3.5"/></button></div>
    </div>
    {props.enabled ? <div className="mt-3 space-y-3 border-t border-slate-800 pt-3">
      <label className="block"><span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-wider text-slate-600">Notice</span><select value={props.selectedNotice ?? ""} onChange={(event) => props.onNotice(event.target.value || undefined)} className="h-9 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-[11px] text-slate-200 outline-none focus:border-orange-500"><option value="">All notices</option>{props.result.changeNotices.map((notice)=><option key={notice.id ?? notice.number ?? notice.name ?? "change"} value={notice.id ?? notice.number ?? ""}>CN {notice.number ?? "Unknown"} · {notice.name ?? "Unnamed change"}</option>)}</select></label>
      <div><span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-wider text-slate-600">Display</span><div className="grid grid-cols-3 rounded-lg border border-slate-700 bg-slate-900 p-1">{filters.map(({value,label})=><button key={value} type="button" onClick={()=>props.onFilter(value)} className={`h-7 rounded-md text-[10px] font-semibold transition ${props.filter===value?"bg-slate-700 text-white":"text-slate-500 hover:text-slate-200"}`}>{label}</button>)}</div></div>
      {unavailable ? <p className="rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-2 text-[10px] text-slate-500">No nodes match this notice and display filter.</p> : null}
      <div className="grid grid-cols-2 gap-2"><button type="button" disabled={unavailable} onClick={props.onIsolate} className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-35 ${props.isolate?"border-orange-500/60 bg-orange-500/10 text-orange-300":"border-slate-700 text-slate-400 hover:bg-slate-800"}`}><IconRoute className="h-3.5 w-3.5"/>{props.isolate?"Isolated":"Isolate"}</button><button type="button" disabled={unavailable} onClick={props.onFocus} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-700 text-[10px] font-semibold text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-35"><IconFocus2 className="h-3.5 w-3.5"/>Frame</button></div>
    </div> : null}
  </aside>;
}
