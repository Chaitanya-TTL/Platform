"use client";

import { AnimatePresence, motion } from "motion/react";
import { IconArrowRight, IconBox, IconBuildingFactory, IconPlus } from "@tabler/icons-react";

interface QuickStartModalProps {
  open: boolean;
  onClose: () => void;
  options: Array<{ label: string; description: string; value: "teamcenter" | "configit"; icon: React.ReactNode }>;
  onSelect: (value: "teamcenter" | "configit") => void;
}

export function QuickStartModal({ open, onClose, options, onSelect }: QuickStartModalProps) {
  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 32, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="w-full max-w-2xl rounded-[32px] border border-slate-700/70 bg-slate-900/95 p-8 shadow-2xl shadow-slate-950/40"
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-cyan-400">Select extraction source</p>
                <h2 className="mt-2 text-3xl font-semibold text-white">Choose a BOM source to begin</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-700/80 bg-slate-800 px-3 py-2 text-slate-400 transition hover:bg-slate-700 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {options.map((option) => (
                <motion.button
                  key={option.value}
                  onClick={() => onSelect(option.value)}
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.98 }}
                  className="group rounded-[28px] border border-slate-700/60 bg-slate-950/80 p-6 text-left shadow-lg shadow-slate-950/20 transition hover:border-cyan-400/40"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-cyan-300">
                    {option.icon}
                  </div>
                  <div className="space-y-2">
                    <div className="text-lg font-semibold text-white">{option.label}</div>
                    <p className="text-sm leading-6 text-slate-400">{option.description}</p>
                  </div>
                  <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-cyan-300">
                    <span>Continue</span>
                    <IconArrowRight className="h-4 w-4" />
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
