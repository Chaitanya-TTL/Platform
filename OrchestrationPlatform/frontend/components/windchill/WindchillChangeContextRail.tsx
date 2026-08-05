"use client";

import { IconChevronLeft, IconChevronRight, IconFocus2, IconRoute } from "@tabler/icons-react";
import type { WindchillChangeImpactResult } from "@/types/windchill-change-impact";

type Props = {
  result: WindchillChangeImpactResult;
  index: number;
  count: number;
  name?: string;
  path?: string[];
  focused?: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onFit: () => void;
  onToggleFocus?: () => void;
};

export function WindchillChangeContextRail(props: Props) {
  const notice = props.result.changeNotices[0];
  return (
    <aside className="absolute left-4 top-20 z-50 w-[min(320px,calc(100%-2rem))] border-l-2 border-orange-400 bg-[#07101f]/95 px-4 py-3 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[.16em] text-orange-300">Affected occurrence</p>
          <h3 className="mt-1 truncate text-sm font-semibold text-white">{props.name || "Change context"}</h3>
          <p className="mt-1 text-[10px] text-slate-500">{props.count ? `${props.index + 1} of ${props.count}` : "No matched occurrence"}{notice?.number ? ` · CN ${notice.number}` : ""}</p>
        </div>
        <div className="flex gap-1">
          <button type="button" disabled={!props.count} onClick={props.onPrevious} aria-label="Previous affected occurrence" className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-30"><IconChevronLeft className="h-3.5 w-3.5" /></button>
          <button type="button" disabled={!props.count} onClick={props.onNext} aria-label="Next affected occurrence" className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-30"><IconChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      {props.path?.length ? <div className="mt-3 border-t border-slate-800 pt-3"><div className="flex items-start gap-2"><IconRoute className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" /><p className="text-[10px] leading-4 text-slate-400">{props.path.join(" → ")}</p></div></div> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {props.onToggleFocus ? <button type="button" onClick={props.onToggleFocus} className={`h-8 rounded-md border text-[10px] font-semibold ${props.focused ? "border-orange-400/50 bg-orange-400/10 text-orange-200" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`}>{props.focused ? "Show context" : "Focus path"}</button> : <span />}
        <button type="button" onClick={props.onFit} disabled={!props.count} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-700 text-[10px] font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-30"><IconFocus2 className="h-3.5 w-3.5" />Fit path</button>
      </div>
    </aside>
  );
}
