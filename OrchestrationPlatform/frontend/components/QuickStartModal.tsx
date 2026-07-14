"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconArrowLeft, IconArrowRight, IconX } from "@tabler/icons-react";
interface CategoryOption {
  label: string;
  description: string;
  value: string;
  icon: ReactNode;
}
interface SourceOption extends CategoryOption {
  disabled?: boolean;
  category: string;
}
interface Props {
  open: boolean;
  onClose: () => void;
  categories: CategoryOption[];
  options: SourceOption[];
  currentView: "categories" | "options";
  selectedCategory: string | null;
  onOpenCategory: (c: string) => void;
  onBack: () => void;
  onSelect: (v: string) => void;
}
export function QuickStartModal({
  open,
  onClose,
  categories,
  options,
  currentView,
  selectedCategory,
  onOpenCategory,
  onBack,
  onSelect,
}: Props) {
  const dialog = useRef<HTMLDivElement>(null),
    previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    previous.current = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() =>
      dialog.current?.querySelector<HTMLElement>("button")?.focus(),
    );
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && dialog.current) {
        const list = [
          ...dialog.current.querySelectorAll<HTMLElement>(
            "button:not([disabled]),a[href]",
          ),
        ];
        if (!list.length) return;
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      removeEventListener("keydown", key);
      previous.current?.focus();
    };
  }, [open, onClose]);
  const visible = selectedCategory
    ? options.filter((o) => o.category === selectedCategory)
    : [];
  return (
    <AnimatePresence>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="source-dialog-title"
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20 }}
            className="max-h-[92dvh] w-full overflow-auto rounded-t-[28px] border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:max-w-2xl sm:rounded-[30px] sm:p-8"
          >
            <header className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                  Select extraction source
                </p>
                <h2
                  id="source-dialog-title"
                  className="mt-2 text-2xl font-semibold sm:text-3xl"
                >
                  {currentView === "categories"
                    ? "Choose a workspace"
                    : `${selectedCategory} sources`}
                </h2>
              </div>
              <div className="flex gap-2">
                {currentView === "options" ? (
                  <button
                    type="button"
                    onClick={onBack}
                    className="flex h-10 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700"
                  >
                    <IconArrowLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Back</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close dialog"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 dark:border-slate-700"
                >
                  <IconX className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="grid gap-4 sm:grid-cols-2">
              {(currentView === "categories" ? categories : visible).map(
                (item) => (
                  <motion.button
                    key={`${item.value}-${item.label}`}
                    type="button"
                    disabled={"disabled" in item && item.disabled}
                    onClick={() =>
                      currentView === "categories"
                        ? onOpenCategory(item.value)
                        : onSelect(item.value)
                    }
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.98 }}
                    className="group rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left transition hover:border-cyan-400 dark:border-slate-700 dark:bg-slate-950/70"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-400/[0.08] dark:text-cyan-300">
                      {item.icon}
                    </span>
                    <span className="mt-4 block text-lg font-semibold">
                      {item.label}
                    </span>
                    <span className="mt-2 block text-sm leading-6 text-slate-500">
                      {item.description}
                    </span>
                    <span className="mt-5 flex items-center gap-2 text-sm font-semibold text-cyan-700 dark:text-cyan-300">
                      {currentView === "categories"
                        ? "Continue"
                        : "disabled" in item && item.disabled
                          ? "Already added"
                          : "Add source"}
                      <IconArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </span>
                  </motion.button>
                ),
              )}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
