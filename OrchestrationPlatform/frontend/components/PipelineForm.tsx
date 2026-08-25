
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
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    const submittedQuery = query.trim();
    if (!submittedQuery) { setError("Enter a Teamcenter product name or Item ID to continue."); return; }
    try {
      toast.loading("Starting Teamcenter extraction...", { id: "teamcenter-start" });
      const result = await startPipeline({ teamcenterQuery: submittedQuery });
      toast.success("Teamcenter extraction started", { id: "teamcenter-start", description: `Loading structure for ${submittedQuery}.` });
      onSubmit(result.jobId ?? "", result.payload ?? null, submittedQuery);
    } catch (cause) {
      const outcome = userFacingError("teamcenter", cause, cause instanceof ApiError ? cause.status : undefined);
      setError(outcome.message);
      toast.error(outcome.title, { id: "teamcenter-start", description: outcome.message });
    }
  };
  return <motion.form onSubmit={handleSubmit} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
    <SourceRequestPanel title="Retrieve Teamcenter structure" description="Enter a product name or Item ID. Teamcenter resolves the live item before extraction." error={error}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1"><SourceField label="Product name or Item ID"><input value={query} onChange={(e) => { setQuery(e.target.value); setError(""); }} placeholder="PEN (View) or 000575" disabled={isLoading} className={sourceInputClass}/></SourceField></div>
        <StatefulButtonDemo isLoading={isLoading} disabled={isLoading} idleLabel="Retrieve structure" loadingLabel="Starting" />
      </div>
    </SourceRequestPanel>
  </motion.form>;
}
