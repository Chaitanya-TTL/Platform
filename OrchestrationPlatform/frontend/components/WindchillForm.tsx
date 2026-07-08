"use client";

import { motion } from "motion/react";
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
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="space-y-4"
    >
      <div className="rounded-[24px] border border-slate-700/70 bg-slate-900/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <label className="text-sm font-semibold text-slate-100">Part ID</label>
          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-cyan-300">
            Windchill
          </span>
        </div>
        <input
          value={partId}
          onChange={(event) => setPartId(event.target.value)}
          placeholder="Enter the Windchill part ID (e.g., 576218)"
          disabled={isRunning}
          className="mt-1 w-full rounded-2xl border border-slate-700/80 bg-slate-950/90 px-4 py-3.5 text-sm text-slate-100 placeholder-slate-500 transition-all duration-200 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <p className="mt-2 text-xs leading-6 text-slate-400">
          Add the part reference to preview the tree structure from Windchill.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <motion.button
        type="submit"
        disabled={isRunning}
        whileHover={{ y: -2, scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        className="cursor-pointer w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 px-5 py-3.5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRunning ? "Running Windchill BOM extraction..." : "Start Windchill BOM extraction"}
      </motion.button>
    </motion.form>
  );
}
