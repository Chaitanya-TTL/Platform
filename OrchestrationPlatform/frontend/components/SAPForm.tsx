"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { IconDatabase } from "@tabler/icons-react";
import { startSapExtraction } from "@/lib/api";
import { StatefulButtonDemo } from "./StatefulButton";

interface SAPFormProps {
  onSubmit: (jobId: string) => void;
  isLoading: boolean;
}

export function SAPForm({ onSubmit, isLoading }: SAPFormProps) {
  const [materialId, setMaterialId] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const value = materialId.trim();
    if (!value) {
      setError("SAP Material ID is required");
      return;
    }
    try {
      const result = await startSapExtraction({ materialId: value });
      if (!result.jobId) throw new Error("No SAP job ID was returned");
      onSubmit(result.jobId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Failed to start SAP extraction",
      );
    }
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="space-y-4"
      aria-label="SAP material extraction setup"
    >
      <div className="rounded-[24px] border border-slate-700/70 bg-slate-900/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <label
            htmlFor="sap-material-id"
            className="text-sm font-semibold text-slate-100"
          >
            Material ID
          </label>
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-amber-300">
            SAP
          </span>
        </div>
        <div className="flex items-stretch overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <input
            id="sap-material-id"
            value={materialId}
            onChange={(event) => setMaterialId(event.target.value)}
            placeholder="Enter an SAP material ID"
            disabled={isLoading}
            className="min-w-0 flex-1 border-0 bg-transparent px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <StatefulButtonDemo isLoading={isLoading} disabled={isLoading} />
        </div>
      </div>
      {error ? (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
    </motion.form>
  );
}
