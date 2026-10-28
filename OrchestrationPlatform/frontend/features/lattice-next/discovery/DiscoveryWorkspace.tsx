"use client";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Image from "next/image";
import {
  IconChevronDown,
  IconChevronUp,
  IconArrowRight,
  IconPlayerStop,
  IconRefresh,
  IconSearch,
  IconTopologyStar3,
  IconX,
} from "@tabler/icons-react";
import type {
  FederatedSearchSnapshot,
  LatticeSource,
  NormalizedSearchResult,
  SourceSearchOutcome,
} from "./contracts";
import { LATTICE_SOURCES, SOURCE_LABELS } from "./capability-matrix";
import { FederatedSearchOrchestrator } from "./federated-search-orchestrator";
import { discoveryReducer, initialDiscoveryState } from "./discovery-reducer";
import { RecentInvestigations } from "./RecentInvestigations";
import {
  cleanInvestigationLabel,
  presentAdditionalSourceContext,
  presentMatch,
  presentOutcome,
  presentRecordIdentity,
  presentSourceContext,
} from "./discovery-presentation";

const SOURCE_LOGOS: Partial<Record<LatticeSource, { src: string; alt: string }>> = {
  windchill: { src: "/images/wc_Logo.png", alt: "Windchill logo" },
  sap: { src: "/images/sap_Logo.png", alt: "SAP logo" },
  configit: { src: "/images/configit_Logo.png", alt: "Configit logo" },
  codebeamer: { src: "/images/cb.png", alt: "Codebeamer logo" },
};

export function DiscoveryWorkspace({
  onInvestigate,
  mode = "recent",
}: {
  onInvestigate: (
    results: NormalizedSearchResult[],
    subjectLabel: string,
  ) => Promise<void>;
  mode?: "recent" | "history";
}) {
  const orchestrator = useMemo(() => new FederatedSearchOrchestrator(), []),
    [state, dispatch] = useReducer(discoveryReducer, initialDiscoveryState),
    [starting, setStarting] = useState(false),
    [confirmOpen, setConfirmOpen] = useState(false),
    [startError, setStartError] = useState<string>(),
    [expandedSources, setExpandedSources] = useState<Set<LatticeSource>>(
      () => new Set(),
    ),
    input = useRef<HTMLInputElement>(null);
  useEffect(
    () =>
      orchestrator.subscribe((snapshot) =>
        dispatch({ type: "snapshot", value: snapshot }),
      ),
    [orchestrator],
  );
  useEffect(() => () => orchestrator.dispose(), [orchestrator]);
  const results = useMemo(
    () =>
      state.snapshot
        ? state.snapshot.request.requestedSources.flatMap((source) => state.snapshot!.outcomes[source].results)
        : [],
    [state.snapshot],
  );
  const selected = results.filter((item) =>
    state.selectedResultIds.has(item.resultId),
  );
  const submit = async () => {
    if (state.query.trim() && state.selectedSources.size) await orchestrator.search(state.query, [...state.selectedSources]);
  };
  const startInvestigation = async () => {
    setStarting(true);
    setStartError(undefined);
    try {
      await onInvestigate(selected, cleanInvestigationLabel(state.query));
      setConfirmOpen(false);
    } catch (cause) {
      setStartError(
        cause instanceof Error && cause.message
          ? cause.message
          : "The investigation could not be opened. Please try again.",
      );
    } finally {
      setStarting(false);
    }
  };
  if (mode === "history") {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-background px-4 py-8 text-foreground sm:px-8">
        <section className="mx-auto max-w-5xl">
          <RecentInvestigations mode="history" />
        </section>
      </div>
    );
  }
  return (
    <AlertDialog.Root
      open={confirmOpen}
      onOpenChange={(open) => {
        if (!starting) setConfirmOpen(open);
      }}
    >
      <MotionConfig reducedMotion="user">
      <div className={`min-h-[calc(100vh-64px)] bg-background px-4 py-10 text-foreground sm:px-8 ${selected.length ? "pb-32 lg:pb-10" : ""}`}>
        <section className="mx-auto grid max-w-7xl grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="min-w-0">
          <header className="max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              Find an engineering product
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-400">
              Search products, parts, materials, and requirements across your engineering systems.
            </p>
            <form
              className="mt-7 flex flex-col gap-3 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <label className="sr-only" htmlFor="lattice-discovery-query">Search engineering data</label>
              <div className="flex min-h-14 min-w-0 flex-1 items-center rounded-xl border border-slate-300 bg-white transition-colors duration-150 ease-out hover:border-slate-400 focus-within:border-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-slate-500 dark:focus-within:border-slate-400">
                <IconSearch aria-hidden="true" className="ml-4 h-5 w-5 shrink-0 text-slate-500" />
                <input
                  id="lattice-discovery-query"
                  ref={input}
                  value={state.query}
                  onChange={(event) => dispatch({ type: "query", value: event.target.value })}
                  placeholder="Product, part, material, or requirement"
                  className="lattice-search-query h-14 min-w-0 flex-1 bg-transparent px-3 text-base text-slate-950 outline-none placeholder:text-slate-500 focus-visible:shadow-none dark:text-white dark:placeholder:text-slate-500"
                />
                {state.query ? (
                  <button
                    type="button"
                    onClick={() => {
                      dispatch({ type: "query", value: "" });
                      input.current?.focus();
                    }}
                    aria-label="Clear search"
                    className="mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center text-slate-500 transition-colors duration-150 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-500 dark:hover:text-white dark:focus-visible:outline-slate-400"
                  >
                    <IconX aria-hidden="true" className="h-4 w-4" />
                  </button>
                ) : null}
                {state.snapshot?.active ? (
                  <button
                    type="button"
                    onClick={() => orchestrator.cancel("user")}
                    aria-label="Cancel search"
                    className="mr-2 inline-flex min-h-11 shrink-0 items-center gap-2 px-3 text-sm font-medium text-slate-600 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-700 dark:text-slate-300 dark:hover:text-white dark:focus-visible:outline-cyan-300"
                  >
                    <IconPlayerStop aria-hidden="true" className="h-4 w-4" /> Stop
                  </button>
                ) : null}
              </div>
              <button
                disabled={!state.query.trim() || !state.selectedSources.size || Boolean(state.snapshot?.active)}
                className="inline-flex min-h-14 shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-800 px-6 text-sm font-semibold text-white transition-[background-color,transform] duration-150 ease-out hover:bg-cyan-900 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200 dark:focus-visible:outline-cyan-300"
              >
                {state.snapshot?.active ? "Searching" : "Search"}
                <IconArrowRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </form>
            <fieldset className="mt-6">
              <legend className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Search in</legend>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {LATTICE_SOURCES.map((source) => {
                  const included = state.selectedSources.has(source);
                  return (
                    <label
                      key={source}
                      className={`group flex min-h-14 min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-[border-color,background-color,box-shadow] duration-200 ease-out ${
                        included
                          ? "border-slate-400 bg-white text-slate-900 shadow-sm dark:border-slate-500 dark:bg-slate-900 dark:text-slate-100"
                          : "border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                      } ${state.snapshot?.active ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={included}
                        disabled={Boolean(state.snapshot?.active)}
                        onChange={() => dispatch({ type: "toggle-source", source })}
                        aria-label={SOURCE_LABELS[source]}
                        className="h-4 w-4 shrink-0 accent-cyan-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600 dark:accent-cyan-300 dark:focus-visible:outline-slate-300"
                      />
                      {SOURCE_LOGOS[source] ? (
                        <Image
                          src={SOURCE_LOGOS[source].src}
                          alt={SOURCE_LOGOS[source].alt}
                          width={40}
                          height={32}
                          className="h-8 w-10 shrink-0 object-contain"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="inline-flex h-8 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-bold tracking-tight text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        >
                          TC
                        </span>
                      )}
                      <span className="min-w-0 flex-1 break-words font-medium leading-4">{SOURCE_LABELS[source]}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </header>

          {state.snapshot ? (
            <section aria-labelledby="discovery-results-title" className="mt-10">
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
                <div>
                  <h2 id="discovery-results-title" className="text-xl font-semibold text-slate-950 dark:text-white">
                    {state.snapshot.active ? "Searching your systems" : `${results.length} ${results.length === 1 ? "record" : "records"} found`}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    For “{state.snapshot.request.query}”
                  </p>
                </div>
                {selected.length ? <p className="text-sm font-medium text-slate-700 dark:text-slate-300" aria-live="polite">{selected.length} selected</p> : null}
              </div>

              <DiscoverySourceResults
                snapshot={state.snapshot}
                activeSource={state.activeSource}
                selectedResultIds={state.selectedResultIds}
                expandedSources={expandedSources}
                onSourceSelect={(source) =>
                  dispatch({ type: "source-tab-selected", source })
                }
                onSelectResult={(result) => dispatch({ type: "select", result })}
                onRetry={(source) => void orchestrator.retry(source)}
                onToggleExpanded={(source) =>
                  setExpandedSources((current) => {
                    const next = new Set(current);
                    if (next.has(source)) next.delete(source);
                    else next.add(source);
                    return next;
                  })
                }
              />
            </section>
          ) : null}
          <p className="sr-only" aria-live="polite">{state.announcement}</p>
          </div>

          <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start" aria-label="Recent investigations and selected records">
            <RecentInvestigations mode="recent" compact />
            {selected.length ? (
              <div className="mt-8 hidden border-t border-slate-200 pt-5 dark:border-slate-800 lg:block">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {selected.length} {selected.length === 1 ? "record" : "records"} selected
                </p>
                <AlertDialog.Trigger
                  disabled={starting}
                  aria-label={`Open investigation with ${selected.length} selected ${selected.length === 1 ? "record" : "records"}`}
                  className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-cyan-800 px-4 text-sm font-semibold text-white transition-colors hover:bg-cyan-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200 dark:focus-visible:outline-cyan-300"
                >
                  <IconTopologyStar3 aria-hidden="true" className="h-4 w-4" />
                  Open investigation
                </AlertDialog.Trigger>
              </div>
            ) : null}
          </aside>
        </section>
      </div>
      {selected.length ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] dark:border-slate-800 dark:bg-slate-950 lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {selected.length} selected
            </p>
            <AlertDialog.Trigger
              disabled={starting}
              aria-label={`Open investigation with ${selected.length} selected ${selected.length === 1 ? "record" : "records"}`}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-cyan-800 px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-300 dark:text-slate-950 dark:focus-visible:outline-cyan-300"
            >
              Open investigation <IconArrowRight aria-hidden="true" className="h-4 w-4" />
            </AlertDialog.Trigger>
          </div>
        </div>
      ) : null}
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-slate-950/60" />
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-6 text-slate-950 shadow-xl dark:border-slate-700 dark:bg-slate-950 dark:text-white">
          <AlertDialog.Title className="text-lg font-semibold">
            Open investigation in Lattice?
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Continue with {selected.length} selected {selected.length === 1 ? "record" : "records"}? Lattice will use these source records to create the investigation.
          </AlertDialog.Description>
          {selected.length ? (
            <ul className="mt-4 divide-y divide-slate-200 text-sm dark:divide-slate-800">
              {selected.slice(0, 4).map((result) => (
                <li key={result.resultId} className="flex min-w-0 flex-wrap justify-between gap-x-4 gap-y-1 py-2">
                  <span className="min-w-0 break-words font-medium">{result.displayName}</span>
                  <span className="text-slate-500 dark:text-slate-400">{SOURCE_LABELS[result.source]}</span>
                </li>
              ))}
              {selected.length > 4 ? (
                <li className="py-2 text-slate-600 dark:text-slate-400">
                  And {selected.length - 4} more {selected.length - 4 === 1 ? "record" : "records"}
                </li>
              ) : null}
            </ul>
          ) : null}
          {startError ? <p role="alert" className="mt-4 text-sm text-rose-700 dark:text-rose-300">{startError}</p> : null}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <AlertDialog.Close
              disabled={starting}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-800 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900 dark:focus-visible:outline-cyan-300"
            >
              Cancel
            </AlertDialog.Close>
            <button
              type="button"
              onClick={() => void startInvestigation()}
              disabled={starting}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-cyan-800 px-4 text-sm font-semibold text-white hover:bg-cyan-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 disabled:cursor-wait disabled:opacity-50 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200 dark:focus-visible:outline-cyan-300"
            >
              {starting ? "Opening Lattice..." : "Continue to Lattice"}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
      </MotionConfig>
    </AlertDialog.Root>
  );
}

export function DiscoverySourceResults({
  snapshot,
  activeSource,
  selectedResultIds,
  expandedSources,
  onSourceSelect,
  onSelectResult,
  onRetry,
  onToggleExpanded,
}: {
  snapshot: FederatedSearchSnapshot;
  activeSource: LatticeSource | null;
  selectedResultIds: ReadonlySet<string>;
  expandedSources: ReadonlySet<LatticeSource>;
  onSourceSelect: (source: LatticeSource) => void;
  onSelectResult: (result: NormalizedSearchResult) => void;
  onRetry: (source: LatticeSource) => void;
  onToggleExpanded: (source: LatticeSource) => void;
}) {
  const requestedSources = snapshot.request.requestedSources;
  const source = activeSource && requestedSources.includes(activeSource)
    ? activeSource
    : requestedSources[0] ?? null;
  const tabRefs = useRef<Partial<Record<LatticeSource, HTMLButtonElement>>>({});
  const outcome = source ? snapshot.outcomes[source] ?? null : null;
  const results = outcome?.results ?? [];
  const visibleResults = getVisibleResults(results, expandedSources);

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentSource: LatticeSource,
  ) => {
    const currentIndex = requestedSources.indexOf(currentSource);
    let nextIndex: number;
    switch (event.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % requestedSources.length;
        break;
      case "ArrowLeft":
        nextIndex =
          (currentIndex - 1 + requestedSources.length) %
          requestedSources.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = requestedSources.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextSource = requestedSources[nextIndex];
    if (nextSource) {
      onSourceSelect(nextSource);
      tabRefs.current[nextSource]?.focus();
    }
  };

  return (
    <div className="mt-4 min-w-0">
      {requestedSources.length ? (
        <div
          role="tablist"
          aria-label="Search sources"
          aria-orientation="horizontal"
          className="flex min-w-0 flex-wrap gap-2 border-b border-slate-200 pb-2 dark:border-slate-800"
        >
          {requestedSources.map((requestedSource) => {
            const requestedOutcome =
              snapshot.outcomes[requestedSource] ?? null;
            const resultCount = requestedOutcome?.results.length ?? 0;
            const presentation = presentOutcome(
              requestedSource,
              requestedOutcome,
              snapshot.request.query,
            );
            const selected = requestedSource === source;

            return (
              <button
                key={requestedSource}
                ref={(element) => {
                  tabRefs.current[requestedSource] = element ?? undefined;
                }}
                id={`lattice-source-tab-${requestedSource}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`lattice-source-panel-${requestedSource}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => onSourceSelect(requestedSource)}
                onKeyDown={(event) =>
                  handleTabKeyDown(event, requestedSource)
                }
                className={`inline-flex min-h-11 min-w-0 max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-0.5 border px-3 py-1.5 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 dark:focus-visible:outline-cyan-300 ${
                  selected
                    ? "border-cyan-800 bg-cyan-50 text-slate-950 dark:border-cyan-300 dark:bg-cyan-950 dark:text-white"
                    : "border-slate-300 text-slate-700 hover:border-slate-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500"
                }`}
              >
                <span className="break-words font-semibold">
                  {SOURCE_LABELS[requestedSource]}
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {resultCount
                    ? `${resultCount} match${resultCount === 1 ? "" : "es"}`
                    : presentation.label}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {source ? (
        <section
          id={`lattice-source-panel-${source}`}
          role="tabpanel"
          aria-labelledby={`lattice-source-tab-${source}`}
          tabIndex={0}
          className="min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 dark:focus-visible:outline-cyan-300"
        >
          <ul
            className="divide-y divide-slate-200 dark:divide-slate-800"
            aria-label={`${SOURCE_LABELS[source]} search status`}
          >
            <SourceProgress
              source={source}
              query={snapshot.request.query}
              outcome={outcome}
              searchActive={snapshot.active}
              resultCount={results.length}
              expanded={expandedSources.has(source)}
              onRetry={() => onRetry(source)}
              onToggleExpanded={() => onToggleExpanded(source)}
            />
          </ul>

          {results.length ? (
            <ul
              className="mt-2 divide-y divide-slate-200 dark:divide-slate-800"
              aria-label={`${SOURCE_LABELS[source]} search results`}
            >
              <AnimatePresence initial={false}>
                {visibleResults.map((result, index) => (
                  <motion.li
                    key={result.resultId}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{
                      layout: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
                      opacity: {
                        duration: 0.16,
                        delay: Math.min(index * 0.025, 0.16),
                      },
                      y: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
                    }}
                  >
                    <ResultRow
                      result={result}
                      selected={selectedResultIds.has(result.resultId)}
                      onSelect={() => onSelectResult(result)}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : !snapshot.active ? (
            <p className="py-6 text-sm text-slate-600 dark:text-slate-400">
              No records are available from {SOURCE_LABELS[source]} for this
              search.
            </p>
          ) : null}
        </section>
      ) : null}
      {requestedSources
        .filter((requestedSource) => requestedSource !== source)
        .map((requestedSource) => (
          <div
            key={requestedSource}
            id={`lattice-source-panel-${requestedSource}`}
            role="tabpanel"
            aria-labelledby={`lattice-source-tab-${requestedSource}`}
            hidden
          />
        ))}
    </div>
  );
}

function SourceProgress({
  source,
  query,
  outcome,
  searchActive,
  resultCount,
  expanded,
  onRetry,
  onToggleExpanded,
}: {
  source: LatticeSource;
  query: string;
  outcome: SourceSearchOutcome | null;
  searchActive: boolean;
  resultCount: number;
  expanded: boolean;
  onRetry: () => void;
  onToggleExpanded: () => void;
}) {
  const state = presentOutcome(source, outcome, query);
  const showStatus = state.tone !== "success";
  if (!showStatus && resultCount <= 3 && !state.technicalDetail) return null;

  return (
    <li className={showStatus ? "py-3" : "py-2"}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {showStatus ? (
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{SOURCE_LABELS[source]}</h3>
              <span className={`text-sm ${state.tone === "warning" ? "text-amber-800 dark:text-amber-300" : state.tone === "active" ? "text-cyan-800 dark:text-cyan-300" : "text-slate-600 dark:text-slate-400"}`}>
                {state.title}
              </span>
            </div>
            {state.message ? <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-400">{state.message}</p> : null}
          </div>
        ) : null}
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {state.actionLabel && !searchActive ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-cyan-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-700 dark:text-cyan-300 dark:focus-visible:outline-cyan-300"
          >
            <IconRefresh aria-hidden="true" className="h-4 w-4" />
            {state.actionLabel}
          </button>
          ) : null}
          {resultCount > 3 ? (
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-expanded={expanded}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-cyan-800 px-4 text-sm font-semibold text-cyan-900 transition-colors hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 dark:border-cyan-300 dark:text-cyan-200 dark:hover:bg-cyan-950 dark:focus-visible:outline-cyan-300"
            >
              {expanded ? <IconChevronUp aria-hidden="true" className="h-4 w-4" /> : <IconChevronDown aria-hidden="true" className="h-4 w-4" />}
              {expanded ? "Show fewer results" : `Load ${resultCount - 3} more results`}
            </button>
          ) : null}
        </div>
      </div>
      {state.technicalDetail ? (
        <details className="mt-2 text-sm">
          <summary className="min-h-10 w-fit cursor-pointer py-2 text-slate-600 underline-offset-4 hover:underline dark:text-slate-400">Technical details</summary>
          <p className="max-w-3xl whitespace-pre-wrap break-words pb-2 text-slate-600 dark:text-slate-400">{state.technicalDetail}</p>
        </details>
      ) : null}
    </li>
  );
}

function ResultRow({
  result,
  selected,
  onSelect,
}: {
  result: NormalizedSearchResult;
  selected: boolean;
  onSelect: () => void;
}) {
  const identity = presentRecordIdentity(result);
  const context = presentSourceContext(result);
  const additionalContext = presentAdditionalSourceContext(result);

  return (
    <div className={`py-4 ${selected ? "border-l-2 border-cyan-700 pl-4 dark:border-cyan-300" : "pl-[18px]"}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <span className="block break-words text-base font-semibold text-slate-950 dark:text-slate-100">
            {result.displayName}
          </span>
          {identity ? (
            <span className="mt-1 block break-words text-sm text-slate-600 dark:text-slate-400">
              {identity}
            </span>
          ) : null}
          {context.length ? (
            <ul className="mt-1 flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
              {context.map((item) => (
                <li key={item.label} className="break-words">
                  <span className="font-medium">{item.label}:</span> {item.value}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:pt-1">
          <span className="text-sm text-slate-600 dark:text-slate-400">{presentMatch(result.matchCategory)}</span>
          <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className={`min-h-10 min-w-20 px-3 text-sm font-semibold transition-[background-color,color,border-color,transform] duration-150 ease-out active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-700 dark:focus-visible:outline-cyan-300 ${selected ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950" : "border border-slate-300 text-slate-800 hover:border-slate-500 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-500"}`}
          >
            {selected ? "Selected" : "Select"}
          </button>
        </div>
      </div>
      <details className="mt-2 text-sm">
        <summary className="min-h-10 w-fit cursor-pointer py-2 text-slate-600 underline-offset-4 hover:underline dark:text-slate-400">Why this match</summary>
        <div className="max-w-3xl pb-2 text-slate-700 dark:text-slate-300">
          <p>{result.matchReason}</p>
          {result.description ? <p className="mt-2 text-slate-600 dark:text-slate-400">{result.description}</p> : null}
        </div>
      </details>
      {additionalContext.length ? (
        <details className="text-sm">
          <summary className="min-h-10 w-fit cursor-pointer py-2 text-slate-600 underline-offset-4 hover:underline dark:text-slate-400">
            Source details
          </summary>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 pb-2 text-slate-600 dark:text-slate-400">
            {additionalContext.map((item) => (
              <li key={item.label} className="break-words">
                <span className="font-medium">{item.label}:</span> {item.value}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function getVisibleResults(
  results: readonly NormalizedSearchResult[],
  expandedSources: ReadonlySet<LatticeSource>,
): NormalizedSearchResult[] {
  const visible: NormalizedSearchResult[] = [];
  const seen: Partial<Record<LatticeSource, number>> = {};
  for (const result of results) {
    const count = seen[result.source] ?? 0;
    if (expandedSources.has(result.source) || count < 3) visible.push(result);
    seen[result.source] = count + 1;
  }
  return visible;
}
