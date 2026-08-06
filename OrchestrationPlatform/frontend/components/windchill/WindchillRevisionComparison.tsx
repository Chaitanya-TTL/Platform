"use client";

import { useMemo, useState } from "react";
import { IconChevronRight, IconPackage, IconX } from "@tabler/icons-react";
import { revisionTrees } from "@/lib/windchill-revision";
import type { TreeNodeData } from "@/types/bom-comparison";
import type {
  WindchillRevisionChange,
  WindchillRevisionComparisonResult,
  WindchillRevisionStatus,
} from "@/types/windchill-revision";

type Filter = "all" | WindchillRevisionStatus;
const filters: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "added", label: "Added" },
  { value: "removed", label: "Removed" },
  { value: "changed", label: "Modified" },
  { value: "moved", label: "Moved" },
  { value: "unchanged", label: "Unchanged" },
];
const tones: Record<WindchillRevisionStatus, string> = {
  added: "text-emerald-400",
  removed: "text-rose-400",
  moved: "text-sky-400",
  changed: "text-amber-400",
  unchanged: "text-slate-500",
};

function visible(node: TreeNodeData, map: Record<string, WindchillRevisionChange>, filter: Filter): boolean {
  if (filter === "all" || (map[node.id]?.status ?? "unchanged") === filter) return true;
  return (node.children ?? []).some((child) => visible(child, map, filter));
}

function RevisionNode({ node, map, filter, level, onSelect }: {
  node: TreeNodeData;
  map: Record<string, WindchillRevisionChange>;
  filter: Filter;
  level: number;
  onSelect: (node: TreeNodeData, change?: WindchillRevisionChange) => void;
}) {
  const [open, setOpen] = useState(level < 2);
  const change = map[node.id];
  const status = change?.status ?? "unchanged";
  const children = node.children ?? [];
  if (!visible(node, map, filter)) return null;
  return (
    <div>
      <div className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-800/65" style={{ marginLeft: `${level * 14}px` }}>
        <button type="button" onClick={() => setOpen((value) => !value)} className="flex h-7 w-7 shrink-0 items-center justify-center text-slate-500">
          {children.length ? <IconChevronRight className={`h-4 w-4 transition ${open ? "rotate-90" : ""}`} /> : <IconPackage className="h-3.5 w-3.5" />}
        </button>
        <button type="button" onClick={() => onSelect(node, change)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-xs font-semibold text-slate-200">{node.name}</span>
          <span className="block truncate text-[10px] text-slate-600">{String(node.attributes?.["Item ID"] ?? node.id)}</span>
        </button>
        <span className={`text-[9px] font-semibold uppercase ${tones[status]}`}>{status === "changed" ? "modified" : status}</span>
      </div>
      {open ? children.map((child) => <RevisionNode key={child.id} node={child} map={map} filter={filter} level={level + 1} onSelect={onSelect} />) : null}
    </div>
  );
}

export function WindchillRevisionComparison({ result, onClose }: { result: WindchillRevisionComparisonResult; onClose: () => void }) {
  const trees = useMemo(() => revisionTrees(result), [result]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<{ node: TreeNodeData; change?: WindchillRevisionChange } | null>(null);
  if (!trees) return null;
  const changedTotal = result.summary.added + result.summary.removed + result.summary.changed + result.summary.moved;
  return (
    <section className="mt-3 rounded-xl border border-slate-800 bg-slate-950/55 p-3">
      <header className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{result.fromVersion.display} <span className="mx-1 text-slate-600">→</span> {result.toVersion.display}</h3>
          <p className="mt-1 text-[11px] text-slate-500">{changedTotal} differences · {result.summary.unchanged} unchanged</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white"><IconX className="h-4 w-4" /></button>
      </header>
      <div className="mt-3 flex gap-1 overflow-x-auto">
        {filters.map(({ value, label }) => (
          <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition ${filter === value ? "bg-slate-100 text-slate-950" : "text-slate-500 hover:bg-slate-800 hover:text-slate-200"}`}>
            {label}{value !== "all" ? ` ${result.summary[value]}` : ""}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <TreePane title={result.fromVersion.display} root={trees.fromRoot} map={result.fromMap} filter={filter} onSelect={(node, change) => setSelected({ node, change })} />
        <TreePane title={result.toVersion.display} root={trees.toRoot} map={result.toMap} filter={filter} onSelect={(node, change) => setSelected({ node, change })} />
      </div>
      {selected ? (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-semibold text-slate-200">{selected.node.name}</p><p className={`mt-1 text-[10px] font-semibold uppercase ${tones[selected.change?.status ?? "unchanged"]}`}>{selected.change?.status ?? "unchanged"}</p></div>
            <button type="button" onClick={() => setSelected(null)} className="text-slate-600 hover:text-white"><IconX className="h-4 w-4" /></button>
          </div>
          {selected.change?.fromPath ? <p className="mt-2 break-all text-[10px] text-slate-500">From {selected.change.fromPath}</p> : null}
          {selected.change?.toPath ? <p className="mt-1 break-all text-[10px] text-slate-500">To {selected.change.toPath}</p> : null}
          {selected.change?.differences.map((difference) => <p key={difference.field} className="mt-1 text-[10px] text-slate-400">{difference.field}: {String(difference.from ?? "—")} → {String(difference.to ?? "—")}</p>)}
        </div>
      ) : null}
    </section>
  );
}

function TreePane({ title, root, map, filter, onSelect }: { title: string; root: TreeNodeData; map: Record<string, WindchillRevisionChange>; filter: Filter; onSelect: (node: TreeNodeData, change?: WindchillRevisionChange) => void }) {
  return <div className="min-h-0 rounded-lg border border-slate-800 bg-slate-900/40 p-2"><p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">{title}</p><div className="mt-1 max-h-[470px] overflow-auto"><RevisionNode node={root} map={map} filter={filter} level={0} onSelect={onSelect} /></div></div>;
}
