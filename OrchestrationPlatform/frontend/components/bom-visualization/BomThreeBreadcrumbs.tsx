"use client";
import { motion } from "motion/react";
import { IconChevronRight, IconHome } from "@tabler/icons-react";
import type { VisualBomNode } from "@/types/bom-visualization";
export function BomThreeBreadcrumbs({ path, onSelect }: { path: VisualBomNode[]; onSelect: (id: string) => void }) {
  if (!path.length) return null;
  return <motion.nav initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="absolute bottom-4 left-1/2 z-40 flex max-w-[55%] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-2xl border border-slate-700 bg-slate-950/90 p-1.5 shadow-2xl backdrop-blur-xl [scrollbar-width:none]">{path.map((node, index) => <div key={node.id} className="flex shrink-0 items-center"><button type="button" onClick={() => onSelect(node.id)} className={`flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[9px] font-semibold transition ${index === path.length - 1 ? "bg-cyan-500/15 text-cyan-200" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>{index === 0 ? <IconHome className="h-3.5 w-3.5"/> : null}<span className="max-w-40 truncate">{node.name}</span></button>{index < path.length - 1 ? <IconChevronRight className="mx-0.5 h-3 w-3 text-slate-700"/> : null}</div>)}</motion.nav>;
}
