"use client";
import { motion } from "motion/react";
import { IconAffiliate, IconCube } from "@tabler/icons-react";
import type { BomViewMode } from "@/types/bom-visualization";
const items = [
  {
    mode: "constellation" as const,
    label: "2D constellation",
    detail: "Explore product structure and focused engineering context.",
    icon: IconAffiliate,
  },
  {
    mode: "three-dimensional" as const,
    label: "3D context",
    detail: "Inspect the selected product path in spatial context.",
    icon: IconCube,
  },
];
export function BomViewSwitcher({
  mode,
  onChange,
}: {
  mode: BomViewMode;
  onChange: (mode: BomViewMode) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-slate-300 bg-white px-1 py-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {items.map((item) => {
        const Icon = item.icon,
          active = mode === item.mode;
        return (
          <div key={item.mode} className="group relative">
            <button
              type="button"
              aria-label={item.label}
              aria-pressed={active}
              onClick={() => onChange(active ? "tree" : item.mode)}
              className={`relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg ${active ? "text-white" : "text-slate-500 hover:text-cyan-600"}`}
            >
              {active ? (
                <motion.span
                  layoutId="bom-view-active"
                  className="absolute inset-0 rounded-lg bg-cyan-600 shadow-md shadow-cyan-500/20"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              ) : null}
              <Icon className="relative z-10 h-4 w-4" />
            </button>
            <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-[80] hidden w-64 -translate-x-1/2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-left text-white shadow-2xl group-hover:block">
              <b className="block text-[10px]">{item.label}</b>
              <span className="mt-1 block text-[9px] leading-4 text-slate-400">
                {item.detail}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
