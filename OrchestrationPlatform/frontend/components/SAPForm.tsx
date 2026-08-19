"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { motion } from "motion/react";
import { IconChartDots3, IconHierarchy3 } from "@tabler/icons-react";
import { toast } from "sonner";
import { ApiError, startSapExtraction } from "@/lib/api";
import { userFacingError } from "@/lib/user-facing-errors";
import { StatefulButtonDemo } from "./StatefulButton";
import { SourceField, SourceRequestPanel, sourceInputClass } from "@/components/source-workflow/SourceRequestPanel";

interface SAPFormProps { onSubmit: (jobId: string, request?: { materialId: string; plant: string; includeImpact: boolean }) => void; isLoading: boolean }
export function SAPForm({ onSubmit, isLoading }: SAPFormProps) {
  const [materialId, setMaterialId] = useState("");
  const [plant, setPlant] = useState("1001");
  const [includeImpact, setIncludeImpact] = useState(true);
  const [error, setError] = useState("");
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    const value = materialId.trim(), plantValue = plant.trim() || "1001";
    if (!value) { setError("Enter an SAP material ID to continue."); return; }
    try {
      toast.loading(includeImpact ? "Starting SAP material analysis..." : "Starting SAP BOM extraction...", { id: "sap-start" });
      const result = await startSapExtraction({ materialId: value, plant: plantValue, includeSapBusinessImpact: includeImpact });
      if (!result.jobId) throw new Error("The request started without a tracking reference.");
      toast.success(includeImpact ? "SAP material analysis started" : "SAP BOM extraction started", { id: "sap-start", description: `${value} · Plant ${plantValue}` });
      onSubmit(result.jobId, { materialId: value, plant: plantValue, includeImpact });
    } catch (cause) {
      const outcome = userFacingError("sap", cause, cause instanceof ApiError ? cause.status : undefined);
      setError(outcome.message); toast.error(outcome.title, { id: "sap-start", description: outcome.message });
    }
  };
  return <motion.form onSubmit={handleSubmit} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
    <SourceRequestPanel title="Retrieve SAP material evidence" description="Choose a structure-only request or include stock, valuation, and transaction impact." error={error}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_128px]"><SourceField label="Material ID"><input value={materialId} onChange={(e) => { setMaterialId(e.target.value); setError(""); }} placeholder="31 or PLM001007" disabled={isLoading} className={sourceInputClass}/></SourceField><SourceField label="Plant"><input value={plant} onChange={(e) => setPlant(e.target.value)} placeholder="1001" disabled={isLoading} className={sourceInputClass}/></SourceField></div>
      <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div><span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Request scope</span><div className="mt-2 inline-flex rounded-lg border border-slate-300 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900"><ScopeButton active={!includeImpact} disabled={isLoading} icon={<IconHierarchy3 className="h-4 w-4"/>} onClick={() => setIncludeImpact(false)}>BOM structure</ScopeButton><ScopeButton active={includeImpact} disabled={isLoading} icon={<IconChartDots3 className="h-4 w-4"/>} onClick={() => setIncludeImpact(true)}>Operational impact</ScopeButton></div><p className="mt-2 max-w-xl text-xs leading-5 text-slate-500">{includeImpact ? "Includes available stock, valuation, movement, and accounting evidence." : "Retrieves the maintained material BOM for the selected plant."}</p></div>
        <StatefulButtonDemo isLoading={isLoading} disabled={isLoading} idleLabel={includeImpact ? "Analyze material" : "Retrieve BOM"} loadingLabel="Starting"/>
      </div>
    </SourceRequestPanel>
  </motion.form>;
}
function ScopeButton({ active, disabled, icon, children, onClick }: { active: boolean; disabled: boolean; icon: ReactNode; children: ReactNode; onClick: () => void }) { return <button type="button" disabled={disabled} aria-pressed={active} onClick={onClick} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold transition disabled:opacity-50 ${active ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}>{icon}{children}</button>; }
