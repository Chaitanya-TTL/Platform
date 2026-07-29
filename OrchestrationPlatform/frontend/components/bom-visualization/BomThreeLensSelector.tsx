"use client";
import { motion } from "motion/react";
import { IconArrowsExchange, IconBinaryTree, IconBolt, IconChartDots, IconClipboardCheck, IconShieldCheck } from "@tabler/icons-react";
import type { ThreeLens } from "@/types/bom-three";
const lenses = [
  { id: "structure", label: "Structure", icon: IconBinaryTree, description: "Explore hierarchy and branch composition" },
  { id: "comparison", label: "Comparison", icon: IconArrowsExchange, description: "Prioritize cross-source differences" },
  { id: "requirements", label: "Requirements", icon: IconClipboardCheck, description: "Trace direct and corresponding links" },
  { id: "impact", label: "Impact", icon: IconBolt, description: "Reveal affected occurrences and paths" },
  { id: "complexity", label: "Complexity", icon: IconChartDots, description: "Find structurally dense branches" },
  { id: "data-quality", label: "Data quality", icon: IconShieldCheck, description: "Inspect completeness and duplicate risks" },
] as const;
export function BomThreeLensSelector({ value, onChange }: { value: ThreeLens; onChange: (lens: ThreeLens) => void }) {
  return <motion.nav layout className="absolute left-1/2 top-3 z-40 flex -translate-x-1/2 gap-1 rounded-2xl border border-slate-700/80 bg-slate-950/90 p-1.5 shadow-2xl backdrop-blur-xl">{lenses.map((lens) => { const Icon = lens.icon, active = value === lens.id; return <div key={lens.id} className="group relative"><button type="button" onClick={() => onChange(lens.id)} aria-label={`${lens.label}: ${lens.description}`} aria-pressed={active} className={`relative flex h-9 items-center gap-2 rounded-xl px-3 text-[10px] font-semibold transition-colors ${active ? "text-white" : "text-slate-500 hover:text-slate-200"}`}>{active ? <motion.span layoutId="three-lens-active" className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 shadow-lg shadow-cyan-500/20" transition={{ type: "spring", stiffness: 420, damping: 32 }} /> : null}<Icon className="relative z-10 h-4 w-4"/><span className="relative z-10 hidden xl:inline">{lens.label}</span></button><span className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-50 hidden w-48 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-950 p-3 text-[10px] leading-4 text-slate-300 shadow-2xl group-hover:block"><b className="block text-white">{lens.label}</b>{lens.description}</span></div>; })}</motion.nav>;
}
