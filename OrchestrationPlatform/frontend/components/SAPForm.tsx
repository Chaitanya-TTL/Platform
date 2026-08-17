"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { IconChartDots3, IconHierarchy3 } from "@tabler/icons-react";
import { toast } from "sonner";
import { ApiError, startSapExtraction } from "@/lib/api";
import { userFacingError } from "@/lib/user-facing-errors";
import { StatefulButtonDemo } from "./StatefulButton";

interface SAPFormProps { onSubmit: (jobId: string, request?: { materialId: string; plant: string; includeImpact: boolean }) => void; isLoading: boolean }
export function SAPForm({ onSubmit, isLoading }: SAPFormProps) {
  const [materialId, setMaterialId] = useState("");
  const [plant, setPlant] = useState("1001");
  const [includeImpact, setIncludeImpact] = useState(true);
  const [error, setError] = useState("");
  const submitLabel = includeImpact ? "Analyze material" : "Extract BOM";
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    const value = materialId.trim(), plantValue = plant.trim() || "1001";
    if (!value) { setError("Enter an SAP material ID to continue."); toast.error("SAP material ID required"); return; }
    try {
      toast.loading(includeImpact ? "Starting SAP material analysis..." : "Starting SAP BOM extraction...", { id: "sap-start" });
      const result = await startSapExtraction({ materialId: value, plant: plantValue, includeSapBusinessImpact: includeImpact });
      if (!result.jobId) throw new Error("The request started without a tracking reference.");
      toast.success(includeImpact ? "SAP material analysis started" : "SAP BOM extraction started", { id: "sap-start", description: `${value} · Plant ${plantValue}` });
      onSubmit(result.jobId, { materialId: value, plant: plantValue, includeImpact });
    } catch (cause) {
      const outcome = userFacingError("sap", cause, cause instanceof ApiError ? cause.status : undefined);
      setError(outcome.message);
      toast.error(outcome.title, { id: "sap-start", description: outcome.message });
    }
  };
  return <motion.form onSubmit={handleSubmit} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }} className="space-y-3" aria-label="SAP extraction setup">
    <div className="rounded-[22px] border border-slate-700/80 bg-slate-900/70 p-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_112px]">
        <label className="block"><span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Material ID</span><input value={materialId} onChange={(event) => { setMaterialId(event.target.value); setError(""); }} placeholder="31 or PLM001007" disabled={isLoading} className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 text-sm font-medium text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-500/70 disabled:opacity-60" /></label>
        <label className="block"><span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Plant</span><input value={plant} onChange={(event) => setPlant(event.target.value)} placeholder="1001" disabled={isLoading} className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 text-sm font-medium text-slate-100 outline-none focus:border-cyan-500/70 disabled:opacity-60" /></label>
      </div>
      <div className="mt-3 flex flex-col gap-3 border-t border-slate-800 pt-3 sm:flex-row sm:items-end sm:justify-between">
        <div><span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Request</span><div className="inline-flex rounded-xl border border-slate-700 bg-slate-950/80 p-1"><ScopeButton active={!includeImpact} disabled={isLoading} icon={<IconHierarchy3 className="h-3.5 w-3.5" />} onClick={() => setIncludeImpact(false)}>BOM structure</ScopeButton><ScopeButton active={includeImpact} disabled={isLoading} icon={<IconChartDots3 className="h-3.5 w-3.5" />} onClick={() => setIncludeImpact(true)}>Business impact</ScopeButton></div><p className="mt-2 max-w-xl text-xs leading-5 text-slate-500">{includeImpact ? "Loads stock, inventory and cost information. A BOM is included when SAP has one for this material." : "Loads the maintained SAP material BOM for the selected plant."}</p></div>
        <StatefulButtonDemo isLoading={isLoading} disabled={isLoading} idleLabel={submitLabel} loadingLabel="Starting" />
      </div>
    </div>
    {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200">{error}</div> : null}
  </motion.form>;
}
function ScopeButton({ active, disabled, icon, children, onClick }: { active: boolean; disabled: boolean; icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) { return <button type="button" disabled={disabled} aria-pressed={active} onClick={onClick} className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold transition disabled:opacity-50 ${active ? "bg-slate-800 text-slate-100 shadow-sm" : "text-slate-500 hover:text-slate-300"}`}>{icon}{children}</button>; }
