"use client";

import { useState } from "react";

interface WindchillFormProps {
  onSubmit: (partId: string) => void;
  isRunning: boolean;
}

export function WindchillForm({ onSubmit, isRunning }: WindchillFormProps) {
  const [partId, setPartId] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!partId.trim()) {
      setError("Part ID is required");
      return;
    }

    onSubmit(partId.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-3xl border border-slate-700/80 bg-slate-900/80 p-5 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.8)]">
        <label className="block text-sm font-semibold text-slate-100">Part ID</label>
        <input
          value={partId}
          onChange={(event) => setPartId(event.target.value)}
          placeholder="Enter the Windchill part ID (e.g., 576218)"
          disabled={isRunning}
          className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800/90 px-4 py-3 text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isRunning}
        className="w-full rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRunning ? "Running Windchill BOM extraction..." : "Start Windchill BOM extraction"}
      </button>
    </form>
  );
}
