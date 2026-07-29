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
import {
  clearRequirementFocus,
  setRequirementTraceEnabled,
} from "@/lib/requirement-trace-store";
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
        if (!enabled) {
          setRequirementTraceEnabled(false);
          clearRequirementFocus();
        }
        setImpactEnabled(!enabled);
      }}
      className={`inline-flex h-9 items-center cursor-pointer gap-2 rounded-lg border px-3 text-[10px] font-semibold ${enabled ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-300" : "border-slate-300 text-slate-500 dark:border-slate-700"}`}
    >
      <IconSearch className="h-4 w-4" />
      Impact
      {enabled ? (
        <span>{result ? result.totalOccurrences : loadedCount}</span>
      ) : null}
    </button>
  );
}
export function ImpactAnalysisWorkspace({
  result,
}: {
  result: CrossBomImpactResult;
}) {
  const payload = JSON.stringify(result, null, 2),
    download = (name: string, content: string, type: string) => {
      const url = URL.createObjectURL(new Blob([content], { type })),
        a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    };
  return (
    <aside className="fixed inset-x-3 bottom-3 z-[160] mx-auto max-h-[78vh] max-w-6xl overflow-auto rounded-2xl border border-cyan-500/30 bg-slate-950/98 p-4 text-white shadow-2xl">
      <div className="flex justify-between">
        <div>
          <p className="text-[9px] uppercase text-cyan-400">
            Cross-BOM Impact Analysis
          </p>
          <h3 className="mt-2 text-lg font-semibold">{result.selectedName}</h3>
          <p className="text-xs text-slate-500">
            {result.selectedItemId ?? "Name match"} ·{" "}
            {labels[result.selectedSource]}
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
              download(
                `${result.selectedName}-impact.json`,
                payload,
                "application/json",
              )
            }
          >
            <IconDownload />
          </Action>
          <Action title="Close" onClick={clearImpactResult}>
            <IconX />
          </Action>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {result.results.map((bom) => (
          <section
            key={bom.source}
            className={`rounded-2xl border p-3 ${bom.found ? "border-emerald-500/25" : "border-rose-500/25"}`}
          >
            <div className="flex justify-between">
              <b className="text-xs">{labels[bom.source]}</b>
              <span className="text-[9px]">
                {bom.found ? `${bom.occurrences.length} FOUND` : "NOT FOUND"}
              </span>
            </div>
            {bom.occurrences.map((item) => (
              <Occurrence key={`${item.source}-${item.nodeId}`} item={item} />
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}
function Occurrence({ item }: { item: ImpactOccurrence }) {
  return (
    <div className="mt-2 rounded-xl border border-slate-800 p-2">
      <b className="text-[11px]">{item.name}</b>
      <p className="text-[9px] text-slate-500">{item.path.join(" › ")}</p>
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
      title={title}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700"
    >
      {children}
    </button>
  );
}
