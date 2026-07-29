"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { StatefulButtonDemo } from "./StatefulButton";

interface WindchillFormProps {
  onSubmit: (partId: string) => void;
  onLoadVersions?: (partId: string) => void;
  isRunning: boolean;
  isVersionLoading?: boolean;
}

export function WindchillForm({ onSubmit, onLoadVersions, isRunning, isVersionLoading = false }: WindchillFormProps) {
  const [partId, setPartId] = useState("");
  const [error, setError] = useState("");

  const validatedPartId = () => {
    const value = partId.trim();
    if (!value) {
      setError("Part ID is required");
      return null;
    }
    setError("");
    return value;
  };

  return (
    <motion.form onSubmit={(event) => { event.preventDefault(); const value = validatedPartId(); if (value) onSubmit(value); }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: "easeOut" }} className="space-y-4">
      <div className="rounded-[24px] border border-slate-700/70 bg-slate-900/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <label htmlFor="windchill-part-id" className="mb-3 block text-sm font-semibold text-slate-100">Product ID</label>
        <div className="flex items-stretch overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/90">
          <input id="windchill-part-id" value={partId} onChange={(event) => setPartId(event.target.value)} placeholder="628915" disabled={isRunning || isVersionLoading} className="min-w-0 flex-1 border-0 bg-transparent px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-60" />
          <StatefulButtonDemo isLoading={isRunning} disabled={isRunning || isVersionLoading} />
        </div>
        {onLoadVersions ? (
          <button type="button" disabled={isRunning || isVersionLoading} onClick={() => { const value = validatedPartId(); if (value) onLoadVersions(value); }} className="mt-3 w-full rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 disabled:opacity-45">
            {isVersionLoading ? "Loading versions..." : "Load revision history"}
          </button>
        ) : null}
      </div>
      {error ? <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-200">{error}</div> : null}
    </motion.form>
  );
}
