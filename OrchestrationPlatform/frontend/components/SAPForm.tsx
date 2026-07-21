"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { IconClock, IconDatabase } from "@tabler/icons-react";

export function SAPForm() {
  const [materialId, setMaterialId] = useState("");

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="space-y-4"
      aria-label="SAP material extraction setup"
    >
      <div className="rounded-[24px] border border-slate-700/70 bg-slate-900/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <label htmlFor="sap-material-id" className="text-sm font-semibold text-slate-100">
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
            className="min-w-0 flex-1 border-0 bg-transparent px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-0"
          />
          <button
            type="button"
            disabled
            title="SAP backend integration is not connected yet"
            className="inline-flex min-w-[118px] shrink-0 cursor-not-allowed items-center justify-center gap-2 border-l border-amber-400/20 bg-amber-500/10 px-3 py-3 text-xs font-semibold text-amber-200 opacity-75"
          >
            <IconClock className="h-4 w-4" />
            Pending
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-3.5 text-amber-100">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300">
            <IconDatabase className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-semibold">Frontend workspace ready</p>
            <p className="mt-1 text-[11px] leading-5 text-amber-100/65">
              Material ID capture is available. Extraction will be enabled after the SAP backend contract and BOM response are connected.
            </p>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
