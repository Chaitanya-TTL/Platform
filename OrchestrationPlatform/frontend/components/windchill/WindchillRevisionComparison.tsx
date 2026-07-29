"use client";

import { useMemo, useState } from "react";
import { IconChevronRight, IconPackage, IconX } from "@tabler/icons-react";
import type { TreeNodeData } from "@/types/bom-comparison";
import type { WindchillRevisionChange, WindchillRevisionComparisonResult, WindchillRevisionStatus } from "@/types/windchill-revision";
import { revisionTrees } from "@/lib/windchill-revision";
import { WindchillRevisionSummary } from "./WindchillRevisionSummary";

const statusStyle: Record<WindchillRevisionStatus, string> = {
  added: "border-emerald-400/40 bg-emerald-400/10 text-emerald-600 dark:text-emerald-300",
  removed: "border-rose-400/40 bg-rose-400/10 text-rose-600 dark:text-rose-300",
  moved: "border-sky-400/40 bg-sky-400/10 text-sky-600 dark:text-sky-300",
  changed: "border-amber-400/40 bg-amber-400/10 text-amber-600 dark:text-amber-300",
  unchanged: "border-slate-300 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900",
};

type Filter = "all" | WindchillRevisionStatus;

function RevisionNode({ node, map, filter, level, onSelect }: { node: TreeNodeData; map: Record<string, WindchillRevisionChange>; filter: Filter; level: number; onSelect: (node: TreeNodeData, change?: WindchillRevisionChange) => void }) {
  const [open, setOpen] = useState(level < 2);
  const change = map[node.id];
  const status = change?.status ?? "unchanged";
  const children = node.children ?? [];
  const childVisible = children.some((child) => hasStatus(child, map, filter));
  if (filter !== "all" && status !== filter && !childVisible) return null;
  const itemId = String(node.attributes?.["Item ID"] ?? "");
  return (
    <div>
      <div className={`mb-1 flex items-center gap-2 rounded-xl border px-3 py-2 ${statusStyle[status]}`} style={{ marginLeft: `${level * 18}px` }}>
        <button type="button" aria-label={open ? "Collapse node" : "Expand node"} onClick={() => setOpen((value) => !value)} className="h-7 w-7 shrink-0">
          {children.length ? <IconChevronRight className={`h-4 w-4 transition ${open ? "rotate-90" : ""}`} /> : <IconPackage className="h-4 w-4" />}
        </button>
        <button type="button" onClick={() => onSelect(node, change)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold">{node.name}</span>
          <span className="text-xs opacity-75">{itemId ? `Item ID: ${itemId}` : node.id}</span>
        </button>
        <span className="rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-bold uppercase">{status}</span>
      </div>
      {open ? children.map((child) => <RevisionNode key={child.id} node={child} map={map} filter={filter} level={level + 1} onSelect={onSelect} />) : null}
    </div>
  );
}

function hasStatus(node: TreeNodeData, map: Record<string, WindchillRevisionChange>, filter: Filter): boolean {
  if (filter === "all" || map[node.id]?.status === filter) return true;
  return (node.children ?? []).some((child) => hasStatus(child, map, filter));
}

export function WindchillRevisionComparison({ result, onClose }: { result: WindchillRevisionComparisonResult; onClose: () => void }) {
  const trees = useMemo(() => revisionTrees(result), [result]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<{ node: TreeNodeData; change?: WindchillRevisionChange } | null>(null);
  if (!trees) return <p className="mt-4 rounded-xl border border-rose-300 p-4 text-sm text-rose-500">Unable to normalize revision comparison trees.</p>;
  return (
    <section className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/70">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-cyan-600">Historical BOM delta</p>
          <h3 className="text-lg font-semibold">{result.fromVersion.display} to {result.toVersion.display}</h3>
        </div>
        <button type="button" aria-label="Close revision comparison" onClick={onClose}><IconX className="h-5 w-5" /></button>
      </div>
      <WindchillRevisionSummary result={result} />
      <div className="my-4 flex flex-wrap gap-2">
        {(["all", "added", "removed", "moved", "changed", "unchanged"] as Filter[]).map((value) => (
          <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${filter === value ? "border-cyan-500 bg-cyan-500 text-white" : "border-slate-300 dark:border-slate-700"}`}>{value}</button>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <TreePane title={result.fromVersion.display} root={trees.fromRoot} map={result.fromMap} filter={filter} onSelect={(node, change) => setSelected({ node, change })} />
        <TreePane title={result.toVersion.display} root={trees.toRoot} map={result.toMap} filter={filter} onSelect={(node, change) => setSelected({ node, change })} />
      </div>
      {selected ? (
        <aside className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex justify-between gap-3"><div><p className="text-xs uppercase text-cyan-600">Revision detail</p><h4 className="font-semibold">{selected.node.name}</h4></div><button type="button" onClick={() => setSelected(null)}><IconX className="h-4 w-4" /></button></div>
          <p className="mt-2 text-sm">Status: <strong className="capitalize">{selected.change?.status ?? "unchanged"}</strong></p>
          {selected.change?.fromPath ? <p className="mt-1 break-all text-xs text-slate-500">From: {selected.change.fromPath}</p> : null}
          {selected.change?.toPath ? <p className="mt-1 break-all text-xs text-slate-500">To: {selected.change.toPath}</p> : null}
          {selected.change?.differences.map((difference) => <p key={difference.field} className="mt-1 text-xs text-slate-500">{difference.field}: {String(difference.from ?? "-")} to {String(difference.to ?? "-")}</p>)}
        </aside>
      ) : null}
    </section>
  );
}

function TreePane({ title, root, map, filter, onSelect }: { title: string; root: TreeNodeData; map: Record<string, WindchillRevisionChange>; filter: Filter; onSelect: (node: TreeNodeData, change?: WindchillRevisionChange) => void }) {
  return <div className="min-h-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><h4 className="mb-3 text-sm font-semibold">{title}</h4><div className="max-h-[620px] overflow-auto pr-1"><RevisionNode node={root} map={map} filter={filter} level={0} onSelect={onSelect} /></div></div>;
}
