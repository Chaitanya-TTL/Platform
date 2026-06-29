"use client";

import { useState } from "react";

interface ConfigitFormProps {
  onSubmit: (workItemId: string, productModel: string) => void;
  isRunning: boolean;
}

export function ConfigitForm({ onSubmit, isRunning }: ConfigitFormProps) {
  const [workItemId, setWorkItemId] = useState("");
  const [productModel, setProductModel] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!workItemId.trim()) {
      setError("Configit work item ID is required");
      return;
    }

    if (!productModel.trim()) {
      setError("Product model code is required");
      return;
    }

    onSubmit(workItemId.trim(), productModel.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-3xl border border-slate-700/80 bg-slate-900/80 p-5 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.8)]">
        <label className="block text-sm font-semibold text-slate-100">Configit Work Item ID</label>
        <input
          value={workItemId}
          onChange={(event) => setWorkItemId(event.target.value)}
          placeholder="Enter Configit work item id (or none)"
          disabled={isRunning}
          className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-800/90 px-4 py-3 text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div className="rounded-3xl border border-slate-700/80 bg-slate-900/80 p-5 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.8)]">
        <label className="block text-sm font-semibold text-slate-100">Product Model Code</label>
        <input
          value={productModel}
          onChange={(event) => setProductModel(event.target.value)}
          placeholder="Enter product model code"
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
        {isRunning ? "Running Configit extraction..." : "Start Configit extraction"}
      </button>
    </form>
  );
}
