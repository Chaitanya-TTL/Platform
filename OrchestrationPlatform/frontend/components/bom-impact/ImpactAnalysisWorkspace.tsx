"use client";
import type { ReactNode } from "react";
import {
  IconClipboard,
  IconDownload,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import {
  clearImpactResult,
  setImpactEnabled,
} from "@/lib/cross-bom-impact-store";
import { setRequirementTraceEnabled } from "@/lib/requirement-trace-store";
import type {
  CrossBomImpactResult,
  ImpactOccurrence,
} from "@/types/bom-impact";
import type { SourceType } from "@/types/bom-comparison";
const labels: Record<SourceType, string> = {
  teamcenter: "Teamcenter",
  windchill: "Windchill",
  sap: "SAP",
  configit: "Configit",
};
export function ImpactModeToggle({
  enabled,
  result,
  loadedCount,
}: {
  enabled: boolean;
  result: CrossBomImpactResult | null;
  loadedCount: number;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!enabled) setRequirementTraceEnabled(false);
        setImpactEnabled(!enabled);
      }}
      className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[10px] font-semibold ${enabled ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-300" : "border-slate-300 text-slate-500 dark:border-slate-700"}`}
    >
      <IconSearch className="h-4 w-4" />
      Impact {enabled ? "ON" : "OFF"}
      {enabled ? (
        <span className="rounded-full bg-cyan-400/15 px-1.5">
          {result ? result.totalOccurrences : loadedCount}
        </span>
      ) : null}
    </button>
  );
}
export function ImpactAnalysisWorkspace({
  result,
}: {
  result: CrossBomImpactResult;
}) {
  const payload = JSON.stringify(result, null, 2);
  const downloadFile = (name: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name.replace(/[^a-z0-9._-]+/gi, "-");
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const csv = () => {
    const rows = [
      [
        "BOM",
        "Name",
        "Item ID",
        "Quantity",
        "Revision",
        "Parent",
        "Path",
        "Match",
        "Confidence",
      ],
      ...result.occurrences.map((item) => [
        labels[item.source],
        item.name,
        item.itemId ?? "",
        item.quantity ?? "",
        item.revision ?? "",
        item.parentName ?? "",
        item.path.join(" > "),
        item.matchReason,
        `${Math.round(item.confidence * 100)}%`,
      ]),
    ];
    downloadFile(
      `${result.selectedName}-impact.csv`,
      rows
        .map((row) =>
          row.map((value) => `"${value.replace(/"/g, '""')}"`).join(","),
        )
        .join("\n"),
      "text/csv",
    );
  };
  return (
    <aside className="fixed inset-x-3 bottom-3 z-[160] mx-auto max-h-[78vh] max-w-6xl overflow-auto rounded-2xl border border-cyan-500/30 bg-slate-950/98 p-4 text-white shadow-2xl backdrop-blur sm:inset-x-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[.18em] text-cyan-400">
            Cross-BOM Impact Analysis
          </p>
          <h3 className="mt-2 text-lg font-semibold">{result.selectedName}</h3>
          <p className="mt-1 text-xs text-slate-500">
            {result.selectedItemId
              ? `Item ID ${result.selectedItemId}`
              : "Exact normalized-name search"}{" "}
            · selected from {labels[result.selectedSource]}
          </p>
        </div>
        <div className="flex gap-1">
          <Action
            title="Copy"
            onClick={() => void navigator.clipboard.writeText(payload)}
          >
            <IconClipboard />
          </Action>
          <Action
            title="JSON"
            onClick={() =>
              downloadFile(
                `${result.selectedName}-impact.json`,
                payload,
                "application/json",
              )
            }
          >
            <IconDownload />
          </Action>
          <button
            type="button"
            onClick={csv}
            className="rounded-lg border border-slate-700 px-3 text-[10px]"
          >
            CSV
          </button>
          <Action title="Close" onClick={clearImpactResult}>
            <IconX />
          </Action>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Metric
          value={`${result.foundSources.length}/${result.searchedSources.length}`}
          label="BOMs found"
        />
        <Metric value={result.totalOccurrences} label="Occurrences" />
        <Metric value={result.missingSources.length} label="BOMs missing" />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {result.results.map((bom) => (
          <section
            key={bom.source}
            className={`rounded-2xl border p-3 ${bom.found ? "border-emerald-500/25 bg-emerald-500/[.06]" : "border-rose-500/25 bg-rose-500/[.06]"}`}
          >
            <div className="flex items-center justify-between">
              <b className="text-xs">{labels[bom.source]}</b>
              <span
                className={
                  bom.found
                    ? "text-[9px] text-emerald-300"
                    : "text-[9px] text-rose-300"
                }
              >
                {bom.found ? `${bom.occurrences.length} FOUND` : "NOT FOUND"}
              </span>
            </div>
            {bom.found ? (
              <div className="mt-3 space-y-2">
                {bom.occurrences.map((item) => (
                  <Occurrence
                    key={`${item.source}-${item.nodeId}-${item.path.join("/")}`}
                    item={item}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[10px] text-slate-500">
                The selected part does not exist in this loaded BOM.
              </p>
            )}
          </section>
        ))}
      </div>
      <section className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
        <p className="text-[9px] font-bold uppercase text-slate-500">
          Observations
        </p>
        <ul className="mt-2 text-[11px] leading-5 text-slate-300">
          {result.observations.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </section>
      <button
        type="button"
        onClick={() => setImpactEnabled(false)}
        className="mt-3 text-[10px] text-slate-500"
      >
        Turn off Impact Analysis
      </button>
    </aside>
  );
}
function Occurrence({ item }: { item: ImpactOccurrence }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
      <div className="flex justify-between gap-2">
        <b className="text-[11px]">{item.name}</b>
        <span
          className={
            item.matchReason === "exact-item-id"
              ? "text-[8px] text-emerald-300"
              : "text-[8px] text-amber-300"
          }
        >
          {item.matchReason === "exact-item-id" ? "EXACT ID" : "NAME MATCH"}
        </span>
      </div>
      <p className="mt-1 text-[9px] text-slate-500">{item.path.join(" › ")}</p>
      <p className="mt-2 text-[9px] text-slate-400">
        Qty {item.quantity ?? "N/A"} · Rev {item.revision ?? "N/A"} · Parent{" "}
        {item.parentName ?? "None"} · {Math.round(item.confidence * 100)}%
      </p>
    </div>
  );
}
function Action({
  children,
  title,
  onClick,
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800"
    >
      {children}
    </button>
  );
}
function Metric({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-2 text-center">
      <b className="block text-base">{value}</b>
      <span className="text-[8px] uppercase text-slate-600">{label}</span>
    </div>
  );
}
