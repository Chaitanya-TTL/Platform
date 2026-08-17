"use client";
import type { ReactNode } from "react";
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle, IconRefresh } from "@tabler/icons-react";
import { TechnicalDetails } from "@/components/feedback/TechnicalDetails";

type Tone = "info" | "success" | "warning" | "error";
const styles: Record<Tone, { shell: string; icon: string; Icon: typeof IconInfoCircle }> = {
  info: { shell: "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/55", icon: "text-cyan-600 dark:text-cyan-400", Icon: IconInfoCircle },
  success: { shell: "border-emerald-300 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/[.06]", icon: "text-emerald-600 dark:text-emerald-400", Icon: IconCircleCheck },
  warning: { shell: "border-amber-300 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/[.06]", icon: "text-amber-600 dark:text-amber-400", Icon: IconAlertTriangle },
  error: { shell: "border-rose-300 bg-rose-50 dark:border-rose-500/25 dark:bg-rose-500/[.06]", icon: "text-rose-600 dark:text-rose-400", Icon: IconAlertTriangle },
};

export function OutcomeNotice({ tone = "info", title, message, technicalDetails, actions, compact = false }: { tone?: Tone; title: string; message: string; technicalDetails?: string | null; actions?: ReactNode; compact?: boolean }) {
  const style = styles[tone];
  return (
    <section className={`rounded-2xl border ${style.shell} ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/60 dark:bg-slate-950/40 ${style.icon}`}><style.Icon className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h4>
          <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">{message}</p>
          {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
          <TechnicalDetails details={technicalDetails} />
        </div>
      </div>
    </section>
  );
}

export function RetryButton({ onClick, label = "Try again" }: { onClick: () => void; label?: string }) {
  return <button type="button" onClick={onClick} className="inline-flex h-9 items-center gap-2 rounded-lg bg-cyan-600 px-3.5 text-xs font-semibold text-white hover:bg-cyan-500"><IconRefresh className="h-4 w-4" />{label}</button>;
}
