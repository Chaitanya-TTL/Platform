"use client";

import { WindchillVersion } from "@/types/windchill-revision";



export function WindchillRevisionSelector({
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
    <section className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/[.05] p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Windchill revision comparison</h3>
        <p className="text-xs text-slate-500">Compare complete historical structures from root to leaf.</p>
      </div>
      {error ? <p className="mb-3 text-sm text-rose-400">{error}</p> : null}
      {versions.length ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="grid gap-1 text-xs font-semibold">
            From version
            <select value={from} onChange={(event) => onFromChange(event.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900">
              {versions.map((version) => <option key={version.partId} value={version.label}>{version.display}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            To version
            <select value={to} onChange={(event) => onToChange(event.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900">
              {versions.map((version) => <option key={version.partId} value={version.label}>{version.display}</option>)}
            </select>
          </label>
          {/* <button type="button" disabled={loading || !from || !to || from === to} onClick={onCompare} className="h-10 rounded-xl bg-cyan-600 px-4 text-sm font-semibold text-white disabled:opacity-45">
            {loading ? "Comparing..." : "Compare versions"}
          </button> */}
        </div>
      ) : null}
    </section>
  );
}
