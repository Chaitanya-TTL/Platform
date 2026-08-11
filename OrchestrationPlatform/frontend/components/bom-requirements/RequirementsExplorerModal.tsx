"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import {
  IconChevronDown,
  IconChevronUp,
  IconGitBranch,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { setImpactEnabled } from "@/lib/cross-bom-impact-store";
import {
  clearRequirementFocus,
  closeRequirementsExplorer,
  selectRequirement,
  useRequirementTrace,
} from "@/lib/requirement-trace-store";
import type { SourceType } from "@/types/bom-comparison";
import type { RequirementCatalogEntry } from "@/types/requirement-trace";

const labels: Record<SourceType, string> = {
  teamcenter: "Teamcenter",
  configit: "Configit",
  windchill: "Windchill",
  sap: "SAP",
  excel: "Excel BOM",
};
const tones: Record<SourceType, string> = {
  teamcenter: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  configit: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  windchill: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  sap: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  excel: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
};

type Filter = "all" | SourceType;
let activeOwner: symbol | null = null;

export function RequirementsExplorerModal({
  catalog,
}: {
  catalog: RequirementCatalogEntry[];
}) {
  const trace = useRequirementTrace();
  const listRef = useRef<HTMLDivElement>(null);
  const [token] = useState(() => Symbol("requirements-drawer"));
  const [ownsDrawer, setOwnsDrawer] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [latestOnly, setLatestOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(
    trace.selectedRequirement?.revision.id ?? null,
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    let entries = catalog.filter((entry) => {
      const sourceMatch = filter === "all" || entry.record.source === filter;
      const content = [
        entry.record.partName,
        entry.record.partId,
        entry.record.bomId,
        entry.revision.revision,
        entry.revision.title,
        entry.revision.description,
        entry.revision.author,
        entry.revision.status,
      ]
        .join(" ")
        .toLowerCase();
      return sourceMatch && (!term || content.includes(term));
    });
    if (latestOnly) {
      const seen = new Set<string>();
      entries = entries.filter((entry) => {
        const key = `${entry.record.source}:${entry.record.partId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    return entries;
  }, [catalog, filter, latestOnly, query]);

  useEffect(() => {
    if (activeOwner === null) activeOwner = token;
    const owns = activeOwner === token;
    setOwnsDrawer(owns);
    setMounted(true);
    return () => {
      if (activeOwner === token) activeOwner = null;
    };
  }, [token]);

  useEffect(() => {
    if (!ownsDrawer) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRequirementsExplorer();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [ownsDrawer]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [filter, latestOnly, query]);

  if (!mounted || !ownsDrawer) return null;

  const activate = (entry: RequirementCatalogEntry) => {
    setImpactEnabled(false);
    selectRequirement(entry);
    setExpandedId(entry.revision.id);
  };

  return createPortal(
    <motion.aside
      role="dialog"
      aria-label="Requirements traceability drawer"
      initial={{ x: 480, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 480, opacity: 0 }}
      transition={{ type: "spring", stiffness: 330, damping: 34 }}
      className="fixed bottom-0 right-0 top-0 z-[9999] flex w-[min(94vw,460px)] flex-col border-l border-slate-700 bg-[#080d1c] text-white shadow-[-24px_0_90px_rgba(0,0,0,.55)]"
    >
      <header className="shrink-0 border-b border-slate-800 bg-[#0a1021] px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[.18em] text-violet-300">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/15">
                <IconGitBranch className="h-4 w-4" />
              </span>
              Requirements Traceability
            </p>
            <h2 className="mt-3 text-xl font-semibold">
              Requirements Explorer
            </h2>
          </div>
          <button
            type="button"
            onClick={closeRequirementsExplorer}
            aria-label="Close drawer"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/70 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
        <div className="relative mt-5">
          <IconSearch className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search part, Item ID, or requirement"
            className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950/60 pl-10 pr-4 text-sm outline-none placeholder:text-slate-600 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20"
          />
        </div>
        <div className="mt-3 flex gap-2 grid grid-cols-3 text-sm pb-1">
          {(["all", "teamcenter", "configit", "windchill", "sap"] as const).map(
            (source) => (
              <button
                key={source}
                type="button"
                onClick={() => setFilter(source)}
                className={`shrink-0 rounded-full border px-3 cursor-pointer py-1.5 text-xs font-medium ${filter === source ? "border-violet-400 bg-violet-500/15 text-violet-200" : "border-slate-700 text-slate-500 hover:text-slate-300"}`}
              >
                {source === "all" ? "All" : labels[source]}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => setLatestOnly((value) => !value)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[9px] font-medium ${latestOnly ? "border-violet-400 bg-violet-500/15 text-violet-200" : "border-slate-700 text-slate-500"}`}
          >
            Latest only
          </button>
        </div>
      </header>

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 [scrollbar-color:rgba(139,92,246,.7)_rgba(30,41,59,.3)] [scrollbar-width:thin]"
      >
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((entry) => {
            const expanded = expandedId === entry.revision.id;
            const focused =
              trace.selectedRequirement?.revision.id === entry.revision.id;
            const occurrences = focused ? (trace.focus?.occurrences ?? []) : [];
            return (
              <article
                key={entry.revision.id}
                className={`overflow-hidden rounded-2xl border transition ${focused ? "border-violet-400/60 bg-violet-500/[.08] shadow-[0_10px_35px_rgba(76,29,149,.16)]" : "border-slate-800 bg-slate-900/55 hover:border-slate-700"}`}
              >
                <button
                  type="button"
                  onClick={() => activate(entry)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[20px] font-semibold text-white">
                        {entry.record.partName}
                      </p>
                      <p className="mt-1 text-[12px] font-semibold uppercase tracking-[.12em] text-cyan-300">
                        Item ID {entry.record.partId}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[8px] font-bold uppercase ${tones[entry.record.source]}`}
                    >
                      {labels[entry.record.source]} · {entry.revision.revision}
                    </span>
                  </div>
                  <h3 className="mt-3 text-[14px] font-semibold leading-5 text-slate-100">
                    {entry.revision.title}
                  </h3>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3">
                    <span className="text-[12px] capitalize text-slate-500">
                      {entry.revision.status} · {entry.revision.createdAt}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-violet-300">
                      {expanded ? "Collapse" : "Trace in BOMs"}
                      {expanded ? (
                        <IconChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <IconChevronDown className="h-3.5 w-3.5" />
                      )}
                    </span>
                  </div>
                </button>

                {expanded ? (
                  <div className="border-t border-slate-800 bg-slate-950/35 px-4 pb-4 pt-3">
                    <p className="text-[13px] leading-5 text-slate-300">
                      {entry.revision.description}
                    </p>
                    <div className="mt-4 space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-[.14em] text-slate-500">
                        Linked BOM occurrences
                      </p>
                      {occurrences.length ? (
                        occurrences.map((item) => (
                          <div
                            key={`${item.source}-${item.nodeId}`}
                            className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/65 px-3 py-2.5"
                          >
                            <span className="text-[13px] font-medium text-slate-200">
                              {labels[item.source]}
                            </span>
                            <span
                              className={`text-[11px] font-bold uppercase ${item.relationship === "direct" ? "text-violet-300" : "text-indigo-300"}`}
                            >
                              {item.relationship === "direct"
                                ? "Direct link"
                                : "Corresponding part"}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-xl border border-dashed border-slate-700 p-3 text-[12px] text-slate-500">
                          No occurrence found in the loaded BOMs.
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={clearRequirementFocus}
                      className="mt-4 h-9 w-full rounded-xl border border-slate-700 text-[11px] font-semibold text-slate-300 hover:bg-slate-800"
                    >
                      Clear requirement focus
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
          {!filtered.length ? (
            <div className="rounded-2xl border border-dashed border-slate-700 px-6 py-12 text-center text-sm text-slate-500">
              No matching requirements.
            </div>
          ) : null}
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between border-t border-slate-800 bg-slate-950/60 px-5 py-3 text-[15px] text-slate-500">
        <span>
          {filtered.length} requirement{filtered.length === 1 ? "" : "s"}
        </span>
        <span>
          {trace.focus
            ? `${trace.focus.occurrences.length} linked occurrence${trace.focus.occurrences.length === 1 ? "" : "s"}`
            : "Select to trace"}
        </span>
      </footer>
    </motion.aside>,
    document.body,
  );
}
