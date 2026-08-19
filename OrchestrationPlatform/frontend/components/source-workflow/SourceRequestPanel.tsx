"use client";
import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  error?: string;
};

export function SourceRequestPanel({ title, description, children, footer, error }: Props) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p> : null}
      </div>
      <div className="p-4">{children}</div>
      {footer ? <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">{footer}</div> : null}
      {error ? <div role="alert" className="border-t border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">{error}</div> : null}
    </section>
  );
}

export function SourceField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      {hint ? <span className="mt-1 block text-xs leading-5 text-slate-500">{hint}</span> : null}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

export const sourceInputClass = "h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600";
