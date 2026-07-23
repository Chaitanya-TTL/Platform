import type { RequirementRevision } from "@/types/requirement-trace";
export function RequirementRevisionCard({ revision, current }: { revision: RequirementRevision; current: boolean }) {
  return <article className={`rounded-xl border p-3 ${current ? "border-violet-400/40 bg-violet-500/[.08]" : "border-slate-800 bg-slate-950/50"}`}>
    <div className="flex items-start justify-between gap-2"><b className="text-xs text-white">{revision.revision} · {revision.title}</b><span className="shrink-0 text-[8px] uppercase text-violet-300">{current ? "Current" : revision.status}</span></div>
    <p className="mt-2 text-[11px] leading-5 text-slate-300">{revision.description}</p>
    {revision.changedFields?.length ? <div className="mt-2 rounded-lg bg-slate-900 p-2 text-[9px] text-slate-400">{revision.changedFields.map((change) => <p key={change.field}><b>{change.field}:</b> {change.before ?? "N/A"} → {change.after ?? "N/A"}</p>)}</div> : null}
    <p className="mt-2 text-[9px] text-slate-500">{revision.createdAt} · {revision.author}</p>
    {revision.changeReason ? <p className="mt-1 text-[9px] text-slate-500">Reason: {revision.changeReason}</p> : null}
  </article>;
}
