"use client";
import { useEffect } from "react";
import { motion } from "motion/react";
import { IconGitBranch, IconX } from "@tabler/icons-react";
import { closeRequirementModal } from "@/lib/requirement-trace-store";
import { RequirementTimeline } from "./RequirementTimeline";
import type { RequirementTraceResult } from "@/types/requirement-trace";
export function RequirementEvolutionModal({ result }: { result: RequirementTraceResult }) {
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape") closeRequirementModal(); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, []);
  return <div className="fixed inset-0 z-[210] flex items-center justify-center p-3 sm:p-6"><button aria-label="Close" className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={closeRequirementModal} />
    <motion.section layoutId="requirement-trace-card" initial={{ opacity: 0, scale: 0.94, y: 22 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="relative z-10 max-h-[88vh] w-full max-w-6xl overflow-auto rounded-[26px] border border-violet-400/30 bg-slate-950 p-4 text-white shadow-2xl sm:p-6">
      <header className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-violet-300"><IconGitBranch className="h-4 w-4" />Requirement evolution</p><h2 className="mt-2 text-2xl font-semibold">{result.selectedPartName}</h2><p className="mt-1 text-xs text-slate-500">Item ID {result.selectedPartId ?? "N/A"} · selected from {result.selectedSource}</p></div><button onClick={closeRequirementModal} className="rounded-xl border border-slate-700 p-2 text-slate-400"><IconX className="h-4 w-4" /></button></header>
      <div className="mt-4 grid grid-cols-3 gap-2"><Metric value={result.sources.length} label="Loaded sources" /><Metric value={result.totalRevisions} label="Revisions" /><Metric value={result.sources.filter((source) => source.confidence === 1).length} label="Exact matches" /></div>
      {result.sources.length ? <div className="mt-5 grid gap-4 lg:grid-cols-2">{result.sources.map((source) => <RequirementTimeline key={`${source.source}-${source.partId}`} source={source} />)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">No hardcoded requirements are linked to this BOM line.</div>}
    </motion.section></div>;
}
function Metric({ value, label }: { value: number; label: string }) { return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-center"><b className="block text-lg">{value}</b><span className="text-[8px] uppercase text-slate-600">{label}</span></div>; }
