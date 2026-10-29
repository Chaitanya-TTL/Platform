"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IconArchive, IconArrowRight, IconArrowUpRight, IconRefresh, IconRestore } from "@tabler/icons-react";
import type { InvestigationListItem } from "../kernel/contracts/investigation-snapshot";
import type { InvestigationRefreshResult } from "../kernel/infrastructure/current-investigation-runtime";
import { createCurrentInvestigationRuntime } from "../kernel/infrastructure/current-investigation-runtime";
import { HttpInvestigationAuthority } from "../kernel/infrastructure/http-investigation-authority";

export function formatCapturedAge(capturedAt: string | undefined, now = Date.now()): string {
  if (!capturedAt || !Number.isFinite(Date.parse(capturedAt))) return "Capture time unknown";
  const elapsed = Math.max(0, now - Date.parse(capturedAt));
  if (elapsed < 60_000) return "Captured just now";
  if (elapsed < 60 * 60_000) return `Captured ${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 24 * 60 * 60_000) return `Captured ${Math.floor(elapsed / (60 * 60_000))}h ago`;
  return `Captured ${Math.floor(elapsed / (24 * 60 * 60_000))}d ago`;
}

export function investigationOpenHref(investigationId: string): string {
  return `/lattice?investigation=${encodeURIComponent(investigationId)}`;
}

export interface RecentInvestigationsViewProps {
  items: readonly InvestigationListItem[];
  includeArchived: boolean;
  mode?: "recent" | "history";
  compact?: boolean;
  loading?: boolean;
  busyInvestigationId?: string;
  error?: string;
  refreshResults?: Readonly<Record<string, InvestigationRefreshResult>>;
  onRetry?: () => void;
  onIncludeArchivedChange: (includeArchived: boolean) => void;
  onRefresh: (item: InvestigationListItem) => void;
  onArchive: (item: InvestigationListItem) => void;
  onRestore: (item: InvestigationListItem) => void;
  now?: number;
}

export function RecentInvestigationsView({
  items,
  includeArchived,
  mode = "history",
  compact = false,
  loading = false,
  busyInvestigationId,
  error,
  refreshResults = {},
  onRetry,
  onIncludeArchivedChange,
  onRefresh,
  onArchive,
  onRestore,
  now,
}: RecentInvestigationsViewProps) {
  const isRecent = mode === "recent";
  const sectionClassName = compact
    ? "min-w-0"
    : "mt-12 border-t border-slate-200 pt-7 dark:border-slate-800";
  return (
    <section aria-labelledby="recent-investigations-title" className={sectionClassName}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="recent-investigations-title" className={`${compact ? "text-base" : "text-lg"} font-semibold text-slate-900 dark:text-slate-100`}>
            {isRecent ? (compact ? "Recent investigations" : "Pick up where you left off") : "Investigation history"}
          </h2>
          {isRecent && !compact ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Your latest active work, kept brief.</p> : null}
        </div>
        {isRecent ? (
          <Link href="/lattice?view=history" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-cyan-800 hover:text-cyan-950 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-700 dark:text-cyan-300 dark:hover:text-cyan-100 dark:focus-visible:outline-cyan-300">
            View all <IconArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        ) : (
          <div className="inline-flex items-center gap-1 border-b border-slate-300 dark:border-slate-700" role="group" aria-label="Investigation archive filter">
            <button type="button" aria-pressed={!includeArchived} onClick={() => onIncludeArchivedChange(false)} className={`min-h-11 px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-700 dark:focus-visible:outline-cyan-300 ${!includeArchived ? "border-b-2 border-cyan-700 text-slate-900 dark:border-cyan-300 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}>
              Active
            </button>
            <button type="button" aria-pressed={includeArchived} onClick={() => onIncludeArchivedChange(true)} className={`min-h-11 px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-700 dark:focus-visible:outline-cyan-300 ${includeArchived ? "border-b-2 border-cyan-700 text-slate-900 dark:border-cyan-300 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}>
              Archived
            </button>
          </div>
        )}
      </div>

      {error ? <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-rose-700 dark:text-rose-300"><p role="alert">{error}</p>{onRetry ? <button type="button" onClick={onRetry} className="min-h-10 font-semibold underline underline-offset-4">Try again</button> : null}</div> : null}
      {loading && !items.length ? <p role="status" className="mt-4 text-sm text-slate-600 dark:text-slate-400">Loading {isRecent ? "recent work" : "investigations"}…</p> : null}
      {!loading && !items.length ? <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">{isRecent ? "Your next search can start a new investigation." : includeArchived ? "No archived investigations." : "No active investigations yet."}</p> : null}

      {items.length ? (
        <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800" aria-label={isRecent ? "Recent investigations" : includeArchived ? "Archived investigations" : "Active investigations"}>
          {(isRecent ? items.slice(0, 3) : items).map((item) => {
            const id = String(item.investigationId);
            const busy = busyInvestigationId === id;
            const result = refreshResults[id];
            if (isRecent) {
              return (
                <li key={id} className="group -mx-3 grid gap-3 px-3 py-4 transition-colors duration-150 ease-out hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center dark:hover:bg-slate-900/50">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{item.subjectLabel}</h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {item.lifecycle} · {item.capturedFreshness.freshness === "current" ? "Current evidence" : `${item.capturedFreshness.freshness} evidence`} · {formatCapturedAge(item.capturedFreshness.capturedAt, now)}
                    </p>
                  </div>
                  <Link href={investigationOpenHref(id)} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-900 transition-[color,transform] duration-150 ease-out hover:translate-x-0.5 hover:text-cyan-800 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-700 active:scale-[0.98] dark:text-slate-100 dark:hover:text-cyan-300 dark:focus-visible:outline-cyan-300">
                    Resume <IconArrowUpRight aria-hidden="true" className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </Link>
                </li>
              );
            }
            return (
              <li key={id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{item.subjectLabel}</h3>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Revision {item.revision}</span>
                    <span className={`text-xs ${item.archivedAt ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>{item.archivedAt ? "Archived" : item.lifecycle}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{formatCapturedAge(item.capturedFreshness.capturedAt, now)} · Updated {new Date(item.updatedAt).toLocaleString()}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                    {item.sourceStatuses.map((source) => (
                      <span key={source.source}>
                        {source.source}: {source.status}{source.freshness !== "current" ? ` · ${source.freshness} freshness` : ""}
                      </span>
                    ))}
                    {item.capturedFreshness.freshness !== "current" ? <span>Overall freshness: {item.capturedFreshness.freshness}</span> : null}
                  </div>
                  {result ? <p role="status" className="mt-2 text-xs text-cyan-800 dark:text-cyan-200">Refresh complete: revision {result.revision}; {result.changedEntityIds.length} changed, {result.addedEntityIds.length} added, {result.removedEntityIds.length} removed.</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={investigationOpenHref(id)} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-cyan-700 px-3 text-sm font-semibold text-white hover:bg-cyan-600 focus-visible:ring-2 focus-visible:ring-cyan-300">
                    Open <IconArrowUpRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                  {item.archivedAt ? (
                    <button type="button" disabled={busy} onClick={() => onRestore(item)} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-cyan-300 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                      <IconRestore aria-hidden="true" className="h-4 w-4" /> Restore
                    </button>
                  ) : (
                    <>
                      <button type="button" disabled={busy} onClick={() => onRefresh(item)} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-cyan-300 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                        <IconRefresh aria-hidden="true" className={`h-4 w-4 ${busy ? "animate-spin motion-reduce:animate-none" : ""}`} /> {busy ? "Refreshing" : "Refresh"}
                      </button>
                      <button type="button" disabled={busy} onClick={() => onArchive(item)} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-cyan-300 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                        <IconArchive aria-hidden="true" className="h-4 w-4" /> Archive
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {!isRecent ? <Link href="/lattice" className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-cyan-800 underline-offset-4 hover:underline dark:text-cyan-300">Back to search</Link> : null}
    </section>
  );
}

export function RecentInvestigations({
  mode = "recent",
  compact = false,
}: {
  mode?: "recent" | "history";
  compact?: boolean;
}) {
  const authority = useMemo(() => new HttpInvestigationAuthority(), []);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [items, setItems] = useState<readonly InvestigationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyInvestigationId, setBusyInvestigationId] = useState<string>();
  const [error, setError] = useState<string>();
  const [refreshResults, setRefreshResults] = useState<Record<string, InvestigationRefreshResult>>({});

  const isRecent = mode === "recent";
  const archiveFilter = isRecent ? false : includeArchived;
  const limit = isRecent ? 3 : 100;
  const reload = useCallback(async (archived: boolean) => {
    setLoading(true);
    setError(undefined);
    try {
      setItems(await authority.list({ includeArchived: archived, limit }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Saved investigations could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [authority, limit]);

  useEffect(() => {
    let active = true;
    void authority.list({ includeArchived: archiveFilter, limit }).then((items) => {
      if (!active) return;
      setItems(items);
      setError(undefined);
      setLoading(false);
    }).catch((cause) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "Saved investigations could not be loaded.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [authority, archiveFilter, limit]);

  const changeArchiveFilter = (include: boolean) => {
    setItems([]);
    setLoading(true);
    setIncludeArchived(include);
  };

  const runAction = async (item: InvestigationListItem, action: "archive" | "restore" | "refresh") => {
    const id = String(item.investigationId);
    setBusyInvestigationId(id);
    setError(undefined);
    try {
      if (action === "archive") await authority.archive(item.investigationId);
      else if (action === "restore") await authority.restore(item.investigationId);
      else {
        const result = await createCurrentInvestigationRuntime().refresh(id, item.revision);
        setRefreshResults((current) => ({ ...current, [id]: result }));
      }
      await reload(includeArchived);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Investigation ${action} failed.`);
    } finally {
      setBusyInvestigationId(undefined);
    }
  };

  return (
    <RecentInvestigationsView
      items={items}
      includeArchived={archiveFilter}
      mode={mode}
      compact={compact}
      loading={loading}
      busyInvestigationId={busyInvestigationId}
      error={error}
      onRetry={() => void reload(archiveFilter)}
      refreshResults={refreshResults}
      onIncludeArchivedChange={changeArchiveFilter}
      onRefresh={(item) => void runAction(item, "refresh")}
      onArchive={(item) => void runAction(item, "archive")}
      onRestore={(item) => void runAction(item, "restore")}
    />
  );
}