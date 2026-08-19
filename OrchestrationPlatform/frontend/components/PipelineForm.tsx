"use client";
import { motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { ApiError, startPipeline } from "@/lib/api";
import { userFacingError } from "@/lib/user-facing-errors";
import { toast } from "sonner";
import { StatefulButtonDemo } from "./StatefulButton";
import { SourceField, SourceRequestPanel, sourceInputClass } from "@/components/source-workflow/SourceRequestPanel";

interface PipelineFormProps { onSubmit: (jobId: string, payload?: unknown, itemId?: string) => void; isLoading: boolean }
export function PipelineForm({ onSubmit, isLoading }: PipelineFormProps) {
  const [itemId, setItemId] = useState("");
  const [error, setError] = useState("");
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    const submittedItemId = itemId.trim();
    if (!submittedItemId) { setError("Enter a Teamcenter item ID to continue."); return; }
    try {
      toast.loading("Starting Teamcenter extraction...", { id: "teamcenter-start" });
      const result = await startPipeline({ teamcenterItemId: submittedItemId });
      toast.success("Teamcenter extraction started", { id: "teamcenter-start", description: `Loading structure for ${submittedItemId}.` });
      onSubmit(result.jobId ?? "", result.payload ?? null, submittedItemId);
    } catch (cause) {
      const outcome = userFacingError("teamcenter", cause, cause instanceof ApiError ? cause.status : undefined);
      setError(outcome.message);
      toast.error(outcome.title, { id: "teamcenter-start", description: outcome.message });
    }
  };
  return <motion.form onSubmit={handleSubmit} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
    <SourceRequestPanel title="Retrieve Teamcenter structure" description="Enter the source-system Item ID." error={error}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1"><SourceField label="Item ID"><input value={itemId} onChange={(e) => { setItemId(e.target.value); setError(""); }} placeholder="002403" disabled={isLoading} className={sourceInputClass}/></SourceField></div>
        <StatefulButtonDemo isLoading={isLoading} disabled={isLoading} idleLabel="Retrieve structure" loadingLabel="Starting" />
      </div>
    </SourceRequestPanel>
  </motion.form>;
}
