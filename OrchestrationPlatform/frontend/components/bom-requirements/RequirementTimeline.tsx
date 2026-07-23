import { RequirementRevisionCard } from "./RequirementRevisionCard";
import type { RequirementSourceResult } from "@/types/requirement-trace";
const labels = { teamcenter: "Teamcenter", configit: "Configit", windchill: "Windchill", sap: "SAP" };
export function RequirementTimeline({ source }: { source: RequirementSourceResult }) {
  const revisions = [...source.revisions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
    <div className="mb-3 flex items-center justify-between"><div><b className="text-sm text-white">{labels[source.source]}</b><p className="text-[9px] text-slate-500">BOM {source.bomId} · {Math.round(source.confidence * 100)}% match</p></div><span className="rounded-full bg-violet-400/10 px-2 py-1 text-[9px] text-violet-300">{revisions.length} revisions</span></div>
    <div className="space-y-2">{revisions.map((revision, index) => <RequirementRevisionCard key={revision.id} revision={revision} current={index === 0} />)}</div>
  </section>;
}
