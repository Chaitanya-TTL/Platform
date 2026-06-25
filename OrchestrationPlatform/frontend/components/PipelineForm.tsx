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
      <div>
        <label className="block text-sm font-medium text-gray-200 mb-2">
          TeamCenter Item ID
        </label>
        <input
          type="text"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          placeholder="e.g., 000575"
          disabled={isLoading}
          className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-500 disabled:opacity-50"
        />
        <p className="text-xs text-gray-400 mt-1">
          Enter the TeamCenter item ID to extract
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
        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:bg-gray-500 disabled:opacity-50 transition font-medium"
      >
        {isLoading ? "Running Pipeline..." : "Start Pipeline"}
      </button>
    </form>
  );
}
