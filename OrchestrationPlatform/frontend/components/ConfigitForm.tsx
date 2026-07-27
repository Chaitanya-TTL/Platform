"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { StatefulButtonDemo } from "./StatefulButton";
interface ConfigitFormProps {
  onSubmit: (workItemId: string, productModel: string) => void;
  isRunning: boolean;
}

export function ConfigitForm({ onSubmit, isRunning }: ConfigitFormProps) {
  const [productId, setProductId] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!productId.trim()) {
      setError("Product ID is required");
      return;
    }

    onSubmit(productId.trim(), productId.trim());
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
          <label className="text-xs font-semibold text-slate-100">
            Product ID
          </label>
          {/* <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.24em] text-cyan-300">
            Configit
          </span> */}
        </div>
        <div className="flex items-stretch overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <input
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
            placeholder="002403"
            disabled={isRunning}
            className="min-w-0 flex-1 border-0 bg-transparent px-4 py-3 text-xs text-slate-100 placeholder-slate-500 transition-all duration-200 focus:border-0 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <StatefulButtonDemo isLoading={isRunning} disabled={isRunning} />
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-3 text-xs text-rose-200">
          {error}
        </div>
      )}
    </motion.form>
  );
}
