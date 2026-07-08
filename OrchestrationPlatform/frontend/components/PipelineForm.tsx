"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { startPipeline } from "@/lib/api";

interface PipelineFormProps {
  onSubmit: (jobId: string, payload?: unknown) => void;
  isLoading: boolean;
}

export function PipelineForm({ onSubmit, isLoading }: PipelineFormProps) {
  const [itemId, setItemId] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!itemId.trim()) {
      setError("TeamCenter Item ID is required");
      return;
    }

    try {
      const result = await startPipeline({
        teamcenterItemId: itemId.trim(),
      });
      onSubmit(result.jobId ?? "", result.payload ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start pipeline");
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
          <label className="text-sm font-semibold text-slate-100">Product ID</label>
          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-cyan-300">
            Teamcenter
          </span>
        </div>
        <input
          type="text"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          placeholder="000575"
          disabled={isLoading}
          className="w-full rounded-2xl border border-slate-700/80 bg-slate-950/90 px-4 py-3.5 text-sm text-slate-100 placeholder-slate-500 transition-all duration-200 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <p className="mt-2 text-xs leading-6 text-slate-400">
          Enter the TeamCenter Item ID, then launch the extraction flow to populate the BOM tree.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <motion.button
        type="submit"
        disabled={isLoading}
        whileHover={{ y: -2, scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        className="cursor-pointer w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-3.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? "Extracting..." : "Extract BOM"}
      </motion.button>
    </motion.form>
  );
}
