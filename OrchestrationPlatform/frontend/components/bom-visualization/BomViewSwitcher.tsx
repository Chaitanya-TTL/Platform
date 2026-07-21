"use client";
import { motion } from "motion/react";
import { IconAffiliate, IconChartDonut, IconCube } from "@tabler/icons-react";
import type { BomViewMode } from "@/types/bom-visualization";
const items = [
  {
    mode: "constellation" as const,
    label: "Information-rich BOM constellation",
    icon: IconAffiliate,
    enabled: true,
  },
  {
    mode: "three-dimensional" as const,
    label: "3D BOM intelligence universe",
    icon: IconCube,
    enabled: true,
  },
  // {
  //   mode: "radial" as const,
  //   label: "Radial BOM explorer",
  //   icon: IconChartDonut,
  //   enabled: true,
  // },
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
              disabled={!item.enabled}
              type="button"
              aria-label={item.label}
              aria-pressed={active}
              onClick={() => onChange(active ? "tree" : item.mode)}
              className={[
                "relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg disabled:cursor-not-allowed disabled:opacity-35",
                active ? "text-white" : "text-slate-500 hover:text-cyan-600",
              ].join(" ")}
            >
              {active ? (
                <motion.span
                  layoutId="bom-view-active"
                  className="absolute inset-0 rounded-lg bg-cyan-600"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              ) : null}
              <Icon className="relative z-10 h-4 w-4" />
            </button>
            <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-950 px-2.5 py-1.5 text-[10px] text-white group-hover:block">
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
