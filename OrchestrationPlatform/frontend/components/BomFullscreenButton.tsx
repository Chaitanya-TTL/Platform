"use client";
import { motion } from "motion/react";
import { IconArrowsMaximize, IconArrowsMinimize } from "@tabler/icons-react";
export function BomFullscreenButton({ isFullscreen, onToggle }: { isFullscreen: boolean; onToggle: () => void }) {
  const Icon = isFullscreen ? IconArrowsMinimize : IconArrowsMaximize;
  const label = isFullscreen ? "Exit fullscreen" : "Open BOM in fullscreen";
  return <div className="group relative inline-flex"><motion.button type="button" aria-label={label} aria-pressed={isFullscreen} title={label} onClick={onToggle} whileTap={{scale:.9}} className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${isFullscreen?"border-cyan-400 bg-cyan-600 text-white":"border-slate-300 text-slate-500 hover:border-cyan-400 hover:text-cyan-600 dark:border-slate-700 dark:text-slate-400 dark:hover:text-cyan-300"}`}><motion.span key={String(isFullscreen)} initial={{opacity:0,scale:.72,rotate:-12}} animate={{opacity:1,scale:1,rotate:0}}><Icon className="h-4 w-4"/></motion.span></motion.button><span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs text-white group-hover:block">{label}</span></div>;
}
