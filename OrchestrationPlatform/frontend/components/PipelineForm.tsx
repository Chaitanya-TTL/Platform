"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { ApiError, startPipeline } from "@/lib/api";
import { userFacingError } from "@/lib/user-facing-errors";
import { toast } from "sonner";
import { StatefulButtonDemo } from "./StatefulButton";

interface PipelineFormProps {
  onSubmit: (jobId: string, payload?: unknown, itemId?: string) => void;
  isLoading: boolean;
}

export function PipelineForm({ onSubmit, isLoading }: PipelineFormProps) {
  const [itemId, setItemId] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const submittedItemId = itemId.trim();

    if (!submittedItemId) {
      setError("Enter a Teamcenter item ID to continue.");
      toast.error("Teamcenter item ID required");
      return;
    }

    try {
      toast.loading("Starting Teamcenter extraction...", { id: "teamcenter-start" });
      const result = await startPipeline({ teamcenterItemId: submittedItemId });
      toast.success("Teamcenter extraction started", { id: "teamcenter-start", description: `Loading structure for ${submittedItemId}.` });
      onSubmit(result.jobId ?? "", result.payload ?? null, submittedItemId);
    } catch (err) {
      const outcome = userFacingError("teamcenter", err, err instanceof ApiError ? err.status : undefined);
      setError(outcome.message);
      toast.error(outcome.title, { id: "teamcenter-start", description: outcome.message });
    }
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="space-y-4"
    >
      <div className="rounded-[24px] border border-slate-700/70 bg-slate-900/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <label className="text-sm font-semibold text-slate-100">
            Product ID
          </label>
          {/* <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-cyan-300">
            Teamcenter
          </span> */}
        </div>
        <div className="flex items-stretch overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <input
            type="text"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            placeholder="002403"
            disabled={isLoading}
            className="min-w-0 flex-1 border-0 bg-transparent px-4 py-3 text-sm text-slate-100 placeholder-slate-500 transition-all duration-200 focus:border-0 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <StatefulButtonDemo isLoading={isLoading} disabled={isLoading} idleLabel="Extract structure" loadingLabel="Starting" />
        </div>
      </div>
      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}
    </motion.form>
  );
}
