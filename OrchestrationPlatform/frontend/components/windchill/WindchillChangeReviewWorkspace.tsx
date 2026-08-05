"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBox,
  IconGitCompare,
  IconHierarchy,
  IconRoute,
  IconX,
} from "@tabler/icons-react";
import type { TreeNodeData } from "@/types/bom-comparison";
import type { WindchillChangeImpactResult } from "@/types/windchill-change-impact";
import type {
  WindchillRevisionComparisonResult,
  WindchillVersion,
} from "@/types/windchill-revision";

import { WindchillChangeMapView } from "@/components/windchill/WindchillChangeMapView";
import { ReviewChangeRecord, ReviewImpactRecord, revisionChangeRecords, groupedRevisionChanges, impactRecords } from "@/lib/windchill-change-review";

type Tab = "overview" | "revision" | "impact" | "map";
type Props = {
  productId: string;
  root: TreeNodeData | null;
  versions: WindchillVersion[];
  from: string;
  to: string;
  revisionLoading: boolean;
  revisionError?: string | null;
  revisionResult: WindchillRevisionComparisonResult | null;
  changeLoading: boolean;
  changeError?: string | null;
  changeImpact: WindchillChangeImpactResult | null;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onCompare: () => void;
  onLoadVersions: () => void;
  onLoadChanges: () => void;
  onClose: () => void;
};
const status = {
  added: ["Added", "text-sky-300", "bg-sky-400"],
  removed: ["Removed", "text-rose-300", "bg-rose-400"],
  changed: ["Modified", "text-amber-300", "bg-amber-400"],
  moved: ["Moved", "text-amber-300", "bg-amber-400"],
  unchanged: ["Unchanged", "text-slate-400", "bg-slate-500"],
} as const;

export function WindchillChangeReviewWorkspace(p: Props) {
  const [tab, setTab] = useState<Tab>("overview"),
    [change, setChange] = useState<ReviewChangeRecord | null>(null),
    [occurrence, setOccurrence] = useState<ReviewImpactRecord | null>(null);
  const changes = useMemo(
      () => revisionChangeRecords(p.revisionResult),
      [p.revisionResult],
    ),
    groups = useMemo(() => groupedRevisionChanges(changes), [changes]),
    impacts = useMemo(
      () => impactRecords(p.root, p.changeImpact),
      [p.root, p.changeImpact],
    ),
    affected = impacts.filter((x) => x.impact.impact === "direct"),
    parents = impacts.filter((x) => x.impact.impact === "indirect");
  useEffect(() => setChange(changes[0] ?? null), [p.revisionResult]);
  useEffect(() => setOccurrence(affected[0] ?? null), [p.changeImpact]);
  const name =
    p.changeImpact?.product.partName || p.root?.name || "Windchill product";
  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-slate-700/80 bg-[#07101f] text-slate-100 shadow-[0_24px_80px_rgba(0,0,0,.28)]">
      <header className="border-b border-slate-800 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-slate-500">
              Engineering change review
            </p>
            <h3 className="mt-1 text-xl font-semibold text-white">{name}</h3>
            <p className="mt-1 text-xs text-slate-400">
              ID {p.productId}
              {p.revisionResult
                ? ` · ${p.revisionResult.fromVersion.display} → ${p.revisionResult.toVersion.display}`
                : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={p.onLoadVersions}
              disabled={p.revisionLoading}
              className="h-9 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            >
              {p.versions.length ? "Refresh revisions" : "Load revisions"}
            </button>
            <button
              onClick={p.onLoadChanges}
              disabled={p.changeLoading || !p.root}
              className="h-9 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            >
              {p.changeLoading ? "Scanning" : "Find changes"}
            </button>
            <button
              onClick={p.onClose}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-800"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        </div>
        {p.versions.length ? (
          <div className="mt-4 grid gap-2 border-t border-slate-800 pt-4 md:grid-cols-[1fr_auto_1fr_auto] md:items-end">
            <Select
              label="From"
              value={p.from}
              versions={p.versions}
              onChange={p.onFromChange}
            />
            <IconArrowRight className="mb-2 hidden h-4 w-4 text-slate-600 md:block" />
            <Select
              label="To"
              value={p.to}
              versions={p.versions}
              onChange={p.onToChange}
            />
            <button
              disabled={
                p.revisionLoading || !p.from || !p.to || p.from === p.to
              }
              onClick={p.onCompare}
              className="h-9 rounded-lg bg-slate-100 px-4 text-xs font-semibold text-slate-950 disabled:bg-slate-800 disabled:text-slate-500"
            >
              Compare
            </button>
          </div>
        ) : null}
        {p.revisionError || p.changeError ? (
          <p className="mt-3 text-xs text-rose-300">
            {p.revisionError || p.changeError}
          </p>
        ) : null}
      </header>
      <nav className="flex gap-5 overflow-x-auto border-b border-slate-800 px-5 sm:px-6">
        {(
          [
            ["overview", "Overview"],
            [
              "revision",
              `Revision delta${changes.length ? ` ${changes.length}` : ""}`,
            ],
            [
              "impact",
              `Change impact${affected.length ? ` ${affected.length}` : ""}`,
            ],
            ["map", "Change map"],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`relative h-12 whitespace-nowrap text-xs font-semibold ${tab === v ? "text-white" : "text-slate-500 hover:text-slate-300"}`}
          >
            {l}
            {tab === v ? (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-cyan-400" />
            ) : null}
          </button>
        ))}
      </nav>
      <div className="min-h-[520px] p-5 sm:p-6">
        {tab === "overview" ? (
          <Overview
            result={p.revisionResult}
            impact={p.changeImpact}
            changes={changes}
            affected={affected}
            parents={parents}
            go={setTab}
          />
        ) : null}
        {tab === "revision" ? (
          <Revision groups={groups} selected={change} onSelect={setChange} />
        ) : null}
        {tab === "impact" ? (
          <Impact
            affected={affected}
            selected={occurrence}
            onSelect={setOccurrence}
          />
        ) : null}
        {tab === "map" ? (
          <WindchillChangeMapView
            result={p.changeImpact}
            records={impacts}
            selectedId={occurrence?.nodeId}
            onSelect={(x) => {
              setOccurrence(x);
              setTab("impact");
            }}
          />
        ) : null}
      </div>
    </section>
  );
}
function Select({
  label,
  value,
  versions,
  onChange,
}: {
  label: string;
  value: string;
  versions: WindchillVersion[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs normal-case text-slate-200"
      >
        {versions.map((v) => (
          <option key={`${label}-${v.partId}`} value={v.label}>
            {v.display}
          </option>
        ))}
      </select>
    </label>
  );
}
function Overview({
  result,
  impact,
  changes,
  affected,
  parents,
  go,
}: {
  result: WindchillRevisionComparisonResult | null;
  impact: WindchillChangeImpactResult | null;
  changes: ReviewChangeRecord[];
  affected: ReviewImpactRecord[];
  parents: ReviewImpactRecord[];
  go: (t: Tab) => void;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">
          Review summary
        </p>
        <h4 className="mt-2 max-w-3xl text-2xl font-semibold leading-tight text-white">
          {result
            ? `${changes.length} structural differences identified between ${result.fromVersion.display} and ${result.toVersion.display}.`
            : "Load two revisions to establish the structural delta."}
        </h4>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-y border-slate-800 py-3 text-xs">
          <Stat n={result?.summary.added ?? 0} l="added" c="text-sky-300" />
          <Stat
            n={result?.summary.removed ?? 0}
            l="removed"
            c="text-rose-300"
          />
          <Stat
            n={(result?.summary.changed ?? 0) + (result?.summary.moved ?? 0)}
            l="modified or moved"
            c="text-amber-300"
          />
          <Stat
            n={affected.length}
            l="affected occurrences"
            c="text-orange-300"
          />
          <Stat n={parents.length} l="impacted parents" c="text-slate-300" />
        </div>
        <div className="mt-6 space-y-3">
          <Finding
            icon={<IconHierarchy />}
            title={`${changes.length} revision differences`}
            detail="Grouped by structural branch with direct evidence."
            onClick={() => go("revision")}
          />
          <Finding
            icon={<IconRoute />}
            title={`${impact?.summary.changeNotices ?? 0} associated Change Notices`}
            detail={`${impact?.summary.affectedParts ?? 0} affected part records produced ${affected.length} matched occurrences.`}
            onClick={() => go("impact")}
          />
        </div>
      </div>
      <aside className="border-l border-slate-800 pl-0 xl:pl-6">
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">
          Primary propagation paths
        </p>
        <div className="mt-3 space-y-3">
          {affected.slice(0, 5).map((x) => (
            <button
              key={x.nodeId}
              onClick={() => go("map")}
              className="block w-full border-b border-slate-800 pb-3 text-left"
            >
              <b className="text-sm text-white">{x.name}</b>
              <span className="mt-1 block truncate text-xs text-slate-500">
                {x.path.join(" → ")}
              </span>
            </button>
          ))}
          {!affected.length ? (
            <p className="py-8 text-sm text-slate-500">
              No affected occurrences matched.
            </p>
          ) : null}
        </div>
        {impact?.warnings.length ? (
          <p className="mt-5 flex gap-2 border-t border-slate-800 pt-4 text-xs text-amber-300">
            <IconAlertTriangle className="h-4 w-4" />
            {impact.warnings.length} partial lookup warnings
          </p>
        ) : null}
      </aside>
    </div>
  );
}
function Stat({ n, l, c }: { n: number; l: string; c: string }) {
  return (
    <span>
      <b className={c}>{n}</b> <span className="text-slate-500">{l}</span>
    </span>
  );
}
function Finding({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-start gap-3 border-b border-slate-800 pb-3 text-left"
    >
      <span className="mt-0.5 text-cyan-400 [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </span>
      <span>
        <b className="text-sm text-slate-200">{title}</b>
        <span className="mt-1 block text-xs text-slate-500">{detail}</span>
      </span>
    </button>
  );
}
function Revision({
  groups,
  selected,
  onSelect,
}: {
  groups: Record<string, ReviewChangeRecord[]>;
  selected: ReviewChangeRecord | null;
  onSelect: (r: ReviewChangeRecord) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <div className="max-h-[620px] overflow-auto pr-2">
        {Object.entries(groups).map(([branch, records]) => (
          <section key={branch} className="mb-5">
            <div className="mb-2 flex justify-between">
              <b className="text-xs text-slate-300">{branch}</b>
              <span className="text-[10px] text-slate-600">
                {records.length} changes
              </span>
            </div>
            {records.map((r) => {
              const m = status[r.status];
              return (
                <button
                  key={r.key}
                  onClick={() => onSelect(r)}
                  className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left ${selected?.key === r.key ? "bg-slate-800" : "hover:bg-slate-900"}`}
                >
                  <span className={`absolute inset-y-2 left-0 w-0.5 ${m[2]}`} />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm text-white">
                      {r.name}
                    </b>
                    <span className="text-[11px] text-slate-500">
                      {r.itemId}
                    </span>
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase ${m[1]}`}
                  >
                    {m[0]}
                  </span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
      <aside className="border-l border-slate-800 pl-6">
        {selected ? (
          <>
            <span
              className={`text-[10px] font-semibold uppercase ${status[selected.status][1]}`}
            >
              {status[selected.status][0]}
            </span>
            <h4 className="mt-1 text-xl font-semibold text-white">
              {selected.name}
            </h4>
            <Evidence
              l="Previous path"
              v={selected.fromPath || "Not present in earlier structure"}
            />
            <Evidence
              l="Current path"
              v={selected.toPath || "Not present in later structure"}
            />
            {selected.differences.map((d) => (
              <Evidence
                key={d.field}
                l={d.field}
                v={`${String(d.from ?? "Not present")} → ${String(d.to ?? "Not present")}`}
              />
            ))}
          </>
        ) : (
          <Empty t="Select a structural change" />
        )}
      </aside>
    </div>
  );
}
function Impact({
  affected,
  selected,
  onSelect,
}: {
  affected: ReviewImpactRecord[];
  selected: ReviewImpactRecord | null;
  onSelect: (r: ReviewImpactRecord) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[.75fr_1.25fr]">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">
          Affected occurrences
        </p>
        <div className="mt-4">
          {affected.map((r) => (
            <button
              key={r.nodeId}
              onClick={() => onSelect(r)}
              className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left ${selected?.nodeId === r.nodeId ? "bg-slate-800" : "hover:bg-slate-900"}`}
            >
              <span className="absolute inset-y-2 left-0 w-0.5 bg-orange-400" />
              <IconBox className="h-4 w-4 text-orange-300" />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm text-white">{r.name}</b>
                <span className="block truncate text-[11px] text-slate-500">
                  {r.path.join(" → ")}
                </span>
              </span>
              <span className="text-[10px] uppercase text-orange-300">
                Affected
              </span>
            </button>
          ))}
        </div>
      </div>
      <aside className="border-l border-slate-800 pl-6">
        {selected ? (
          <>
            <span className="text-[10px] font-semibold uppercase text-orange-300">
              Directly affected
            </span>
            <h4 className="mt-1 text-xl font-semibold text-white">
              {selected.name}
            </h4>
            <Evidence
              l="Occurrence"
              v={selected.itemId || selected.partId || selected.nodeId}
            />
            <p className="mt-6 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">
              Product propagation
            </p>
            <div className="mt-4">
              {selected.path.map((n, i) => (
                <div key={`${n}-${i}`} className="flex items-center gap-3 pb-4">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full border ${i === selected.path.length - 1 ? "border-orange-400 text-orange-300" : "border-slate-700 text-slate-500"}`}
                  >
                    {i === selected.path.length - 1 ? (
                      <IconBox className="h-3.5 w-3.5" />
                    ) : (
                      <IconHierarchy className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <span>
                    <b className="text-sm text-slate-200">{n}</b>
                    <small className="block text-[10px] text-slate-600">
                      {i === selected.path.length - 1
                        ? "Explicit Change Notice relationship"
                        : "Structurally impacted parent"}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <Empty t="Select an affected occurrence" />
        )}
      </aside>
    </div>
  );
}
function Evidence({ l, v }: { l: string; v: string }) {
  return (
    <div className="mt-5">
      <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-600">
        {l}
      </p>
      <p className="mt-1 break-words text-sm leading-6 text-slate-200">{v}</p>
    </div>
  );
}
function Empty({ t }: { t: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center border border-dashed border-slate-800 text-sm text-slate-500">
      <IconGitCompare className="mr-2 h-4 w-4" />
      {t}
    </div>
  );
}
