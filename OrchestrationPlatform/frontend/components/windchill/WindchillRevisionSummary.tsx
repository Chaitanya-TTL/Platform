import type { WindchillRevisionComparisonResult } from "@/types/windchill-revision";

const cards = [
  ["added", "Added", "text-emerald-500"],
  ["removed", "Removed", "text-rose-500"],
  ["moved", "Moved", "text-sky-500"],
  ["changed", "Changed", "text-amber-500"],
  ["unchanged", "Unchanged", "text-slate-500"],
] as const;

export function WindchillRevisionSummary({ result }: { result: WindchillRevisionComparisonResult }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {cards.map(([key, label, tone]) => (
        <div key={key} className="rounded-xl border border-slate-200 bg-white p-3 text-center dark:border-slate-700 dark:bg-slate-900">
          <strong className={`block text-xl ${tone}`}>{result.summary[key]}</strong>
          <span className="text-[11px] font-semibold uppercase text-slate-500">{label}</span>
        </div>
      ))}
    </div>
  );
}
