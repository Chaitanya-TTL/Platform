import type { RequirementRevision } from "@/types/requirement-trace";
export function RequirementRevisionCard({
  revision,
  current,
}: {
  revision: RequirementRevision;
  current: boolean;
}) {
  return (
    <article
      className={`rounded-xl border cursor-pointer p-3 ${current ? "border-violet-400/40 bg-violet-500/[.08]" : "border-slate-800 bg-slate-950/50"}`}
    >
      <div className="flex justify-between gap-2">
        <b className="text-xs text-white">
          {revision.revision} · {revision.title}
        </b>
        <span className="text-[8px] uppercase text-violet-300">
          {current ? "Current" : revision.status}
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-slate-300">
        {revision.description}
      </p>
      <p className="mt-2 text-[9px] text-slate-500">
        {revision.createdAt} · {revision.author}
      </p>
    </article>
  );
}
