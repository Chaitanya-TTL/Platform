"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import {
  IconArrowsExchange,
  IconCheck,
  IconCircleCheck,
  IconHierarchy,
  IconInfoCircle,
  IconPercentage,
  IconX,
} from "@tabler/icons-react";
import type {
  ComparisonField,
  FieldDifference,
  NodeComparison,
  SourceType,
} from "@/types/bom-comparison";

const sourceLabels: Record<SourceType, string> = {
  teamcenter: "Teamcenter",
  windchill: "Windchill",
  configit: "Configit",
  sap: "SAP",
};

const fieldLabels: Record<ComparisonField, string> = {
  itemId: "Item ID",
  name: "Name",
  quantity: "Quantity",
  revision: "Revision",
  parent: "Parent assembly",
  level: "Hierarchy level",
  nodeType: "Node type",
};

const statusStyles = {
  matched: {
    label: "Matched",
    pill: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    accent: "bg-emerald-400",
  },
  changed: {
    label: "Changed",
    pill: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    accent: "bg-amber-400",
  },
  missing: {
    label: "Missing",
    pill: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    accent: "bg-rose-400",
  },
  "source-only": {
    label: "Source-only",
    pill: "border-sky-400/30 bg-sky-400/10 text-sky-300",
    accent: "bg-sky-400",
  },
  probable: {
    label: "Review match",
    pill: "border-violet-400/30 bg-violet-400/10 text-violet-300",
    accent: "bg-violet-400",
  },
} as const;

export function ComparisonReasoningModal({
  open,
  nodeName,
  itemId,
  source,
  counterpartLabel,
  comparison,
  onClose,
}: {
  open: boolean;
  nodeName: string;
  itemId?: string;
  source: SourceType;
  counterpartLabel?: string;
  comparison: NodeComparison | null | undefined;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = bodyOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose, open]);

  if (!open || !comparison || typeof document === "undefined") return null;

  const visual = statusStyles[comparison.status];
  const matchMethod =
    comparison.matchReason === "item-id"
      ? "Exact Item ID"
      : comparison.matchReason === "name-context"
        ? "Name and hierarchy context"
        : comparison.matchReason === "name"
          ? "Probable name and structure match"
          : "No counterpart match";

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close comparison explanation"
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
        onClick={onClose}
      />

      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="comparison-reasoning-title"
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        className="relative z-10 flex max-h-[88vh] w-full max-w-[820px] flex-col overflow-hidden rounded-[28px] border border-slate-700 bg-[#080d1c] text-white shadow-[0_35px_140px_rgba(0,0,0,.78)]"
      >
        <div className={`h-1.5 w-full ${visual.accent}`} />

        <header className="flex shrink-0 items-start justify-between gap-5 border-b border-slate-800 bg-[#0a1021] px-6 py-5 sm:px-7">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[15px] font-bold uppercase tracking-[.18em] text-cyan-300">
              <IconArrowsExchange className="h-4 w-4" /> Comparison explanation
            </p>
            <h2 id="comparison-reasoning-title" className="mt-3 truncate text-xl font-semibold sm:text-2xl">
              {nodeName}
            </h2>
            <p className="mt-1 text-[13px] text-slate-400">
              {sourceLabels[source]}{itemId ? ` · Item ID ${itemId}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded-full border px-3 py-1.5 text-[12px] font-bold uppercase tracking-wide ${visual.pill}`}>
              {visual.label}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/70 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6 [scrollbar-width:thin] sm:px-7">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/55 p-5">
            <p className="text-[12px] font-bold uppercase tracking-[.16em] text-slate-500">Result summary</p>
            <p className="mt-3 text-sm font-medium leading-6 text-slate-100">
              {comparison.reasoning.summary}
            </p>
          </section>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Metric icon={<IconPercentage className="h-4 w-4" />} label="Confidence" value={`${Math.round(comparison.confidence * 100)}%`} />
            <Metric icon={<IconHierarchy className="h-4 w-4" />} label="Match method" value={matchMethod} />
            <Metric icon={<IconArrowsExchange className="h-4 w-4" />} label="Compared against" value={comparison.counterpartSource ? sourceLabels[comparison.counterpartSource] : counterpartLabel || "Compared BOM"} />
          </div>

          <Section title="Why this result was assigned">
            <div className="space-y-2.5">
              {comparison.reasoning.details.map((detail, index) => (
                <div key={`${index}-${detail}`} className="flex gap-3 rounded-xl border border-slate-800 bg-slate-950/35 px-4 py-3">
                  <IconInfoCircle className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                  <p className="text-[13px] leading-5 text-slate-300">{detail.replace(/^•\s*/, "")}</p>
                </div>
              ))}
            </div>
          </Section>

          {comparison.differences.length ? (
            <Section title="Field-level differences">
              <div className="space-y-3">
                {comparison.differences.map((difference) => (
                  <DifferenceCard key={`${difference.field}-${difference.left}-${difference.right}`} difference={difference} />
                ))}
              </div>
            </Section>
          ) : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <FieldGroup
              title="Matched fields"
              fields={comparison.reasoning.matchedFields}
              empty="No comparable fields were matched."
              tone="matched"
            />
            <FieldGroup
              title="Different fields"
              fields={comparison.reasoning.differentFields}
              empty="No comparable field values differ."
              tone="different"
            />
          </div>

          {comparison.counterpartNodeId ? (
            <Section title="Counterpart node">
              <div className="rounded-xl border border-slate-800 bg-slate-950/35 px-4 py-3">
                <p className="text-[13px] uppercase tracking-[.14em] text-slate-500">
                  {comparison.counterpartSource ? sourceLabels[comparison.counterpartSource] : counterpartLabel || "Compared source"}
                </p>
                <p className="mt-1 break-all text-[12px] font-medium text-slate-200">
                  Node ID: {comparison.counterpartNodeId}
                </p>
              </div>
            </Section>
          ) : null}
        </div>

        <footer className="flex shrink-0 justify-end border-t border-slate-800 bg-slate-950/60 px-6 py-4 sm:px-7">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl bg-cyan-600 px-5 text-xs font-semibold text-white hover:bg-cyan-500"
          >
            Close explanation
          </button>
        </footer>
      </motion.section>
    </div>,
    document.body,
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-[12px] font-bold uppercase tracking-[.13em]">{label}</span>
      </div>
      <p className="mt-2 text-[13px] font-semibold leading-4 text-slate-200">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 border-t border-slate-800 pt-5">
      <h3 className="mb-3 text-[12px] font-bold uppercase tracking-[.16em] text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function DifferenceCard({ difference }: { difference: FieldDifference }) {
  return (
    <div className="rounded-xl border border-amber-400/20 bg-amber-400/[.04] p-4">
      <p className="text-[12px] font-semibold text-amber-200">{fieldLabels[difference.field]}</p>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <ValueBox label="Selected source" value={difference.left} />
        <IconArrowsExchange className="h-4 w-4 text-amber-300" />
        <ValueBox label="Compared source" value={difference.right} />
      </div>
    </div>
  );
}

function ValueBox({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <p className="text-[12px] uppercase tracking-[.12em] text-slate-600">{label}</p>
      <p className="mt-1 break-words text-[14px] font-medium text-slate-200">{value || "Not available"}</p>
    </div>
  );
}

function FieldGroup({
  title,
  fields,
  empty,
  tone,
}: {
  title: string;
  fields: ComparisonField[];
  empty: string;
  tone: "matched" | "different";
}) {
  const matched = tone === "matched";
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
      <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[.14em] text-slate-500">
        {matched ? <IconCircleCheck className="h-4 w-4 text-emerald-300" /> : <IconInfoCircle className="h-4 w-4 text-amber-300" />}
        {title}
      </p>
      {fields.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {[...new Set(fields)].map((field) => (
            <span key={field} className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${matched ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-amber-400/25 bg-amber-400/10 text-amber-300"}`}>
              {fieldLabels[field]}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[13px] leading-5 text-slate-500">{empty}</p>
      )}
    </section>
  );
}
