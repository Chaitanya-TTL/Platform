"use client";

import { IconArrowRight } from "@tabler/icons-react";
import type { WindchillVersion } from "@/types/windchill-revision";

export function WindchillRevisionWorkspace({
  versions,
  from,
  to,
  loading,
  error,
  onFromChange,
  onToChange,
  onCompare,
}: {
  versions: WindchillVersion[];
  from: string;
  to: string;
  loading: boolean;
  error?: string | null;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onCompare: () => void;
}) {
  if (!versions.length && !error) return null;
  return (
    <section className="mt-3 rounded-xl border border-slate-800 bg-slate-950/45 p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <div className="min-w-[120px] flex-1">
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">From</label>
          <select value={from} onChange={(event) => onFromChange(event.target.value)} className="h-9 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500">
            {versions.map((version) => <option key={`from-${version.partId}`} value={version.label}>{version.display}</option>)}
          </select>
        </div>
        <IconArrowRight className="hidden h-4 w-4 shrink-0 text-slate-600 xl:mb-2.5 xl:block" />
        <div className="min-w-[120px] flex-1">
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">To</label>
          <select value={to} onChange={(event) => onToChange(event.target.value)} className="h-9 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500">
            {versions.map((version) => <option key={`to-${version.partId}`} value={version.label}>{version.display}</option>)}
          </select>
        </div>
        <button type="button" disabled={loading || !from || !to || from === to} onClick={onCompare} className="h-9 rounded-lg bg-slate-100 px-4 text-xs font-semibold text-slate-950 transition hover:bg-white disabled:bg-slate-800 disabled:text-slate-500">
          {loading ? "Comparing" : "Compare"}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-400">{error}</p> : null}
    </section>
  );
}
