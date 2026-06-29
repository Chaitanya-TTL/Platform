"use client";

import { useState } from "react";
import { startPipeline } from "@/lib/api";

interface PipelineFormProps {
  onSubmit: (jobId: string) => void;
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
      onSubmit(result.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start pipeline");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border border-slate-600/70 bg-slate-800/40 p-4">
        <label className="mb-2 block text-sm font-medium text-gray-200">
          TeamCenter Item ID
        </label>
        <input
          type="text"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          placeholder="Enter TeamCenter BOM ID, e.g. 000575"
          disabled={isLoading}
          className="w-full rounded-lg border border-slate-500 bg-slate-700 px-4 py-3 text-white placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-slate-600 disabled:opacity-50"
        />
        <p className="mt-2 text-xs text-slate-400">
          Enter the TeamCenter item ID, then click the button to start the extraction flow.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500 text-red-200 px-3 py-2 rounded">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="cursor-pointer w-full rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:bg-gray-500 disabled:opacity-50"
      >
        {isLoading ? "Running Pipeline..." : "Run Extraction"}
      </button>
    </form>
  );
}
