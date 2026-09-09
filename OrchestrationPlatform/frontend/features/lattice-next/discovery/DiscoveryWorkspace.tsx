"use client";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  IconChevronDown,
  IconChevronUp,
  IconPlayerStop,
  IconRefresh,
  IconSearch,
  IconTopologyStar3,
  IconSquare,
  IconSquareCheckFilled,
} from "@tabler/icons-react";
import type {
  LatticeSource,
  NormalizedSearchResult,
  SourceSearchOutcome,
} from "./contracts";
import { LATTICE_SOURCES, SOURCE_LABELS } from "./capability-matrix";
import { FederatedSearchOrchestrator } from "./federated-search-orchestrator";
import { discoveryReducer, initialDiscoveryState } from "./discovery-reducer";
import {
  cleanInvestigationLabel,
  presentMatch,
  presentOutcome,
} from "./discovery-presentation";

export function DiscoveryWorkspace({
  onInvestigate,
  recent,
}: {
  onInvestigate: (results: NormalizedSearchResult[]) => Promise<void>;
  recent: { id: string; label: string; updatedAt?: string }[];
}) {
  const orchestrator = useMemo(() => new FederatedSearchOrchestrator(), []),
    [state, dispatch] = useReducer(discoveryReducer, initialDiscoveryState),
    [starting, setStarting] = useState(false),
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
  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#050914] px-4 py-8 text-white sm:px-8">
      <section className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-bold uppercase tracking-[.2em] text-cyan-400">
            Engineering discovery
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Find an engineering product
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Search by product name, item ID, material ID, part number, or
            Configit package path.
          </p>
          <form
            className="mt-7 flex rounded-2xl border border-slate-700 bg-slate-950/90 p-2 shadow-[0_20px_60px_-35px_rgba(34,211,238,.55)] focus-within:border-cyan-500"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <IconSearch className="ml-3 mt-3 h-5 w-5 text-slate-500" />
            <input
              ref={input}
              value={state.query}
              onChange={(event) =>
                dispatch({ type: "query", value: event.target.value })
              }
              placeholder="Search product, item, material, part, or package"
              className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-slate-600"
            />
            <button
              disabled={!state.query.trim() || !state.selectedSources.size || Boolean(state.snapshot?.active)}
              className="rounded-xl bg-cyan-600 px-5 text-sm font-semibold disabled:opacity-45"
            >
              Search connected sources
            </button>
            {state.snapshot?.active ? (
              <button
                type="button"
                onClick={() => orchestrator.cancel("user")}
                aria-label="Cancel search"
                className="ml-2 rounded-xl border border-slate-700 px-3"
              >
                <IconPlayerStop className="h-4 w-4" />
              </button>
            ) : null}
          </form>
        </div>
        <div className="mt-8 grid gap-3">
          {LATTICE_SOURCES.map((source) => (
            <SourceCard
              key={source}
              source={source}
              query={state.query}
              outcome={state.snapshot?.outcomes[source] ?? null}
              included={state.selectedSources.has(source)}
              searchActive={Boolean(state.snapshot?.active)}
              selected={state.selectedResultIds}
              onSelect={(result) => dispatch({ type: "select", result })}
              onRetry={() => void orchestrator.retry(source)}
              onToggleSource={() => dispatch({ type: "toggle-source", source })}
            />
          ))}
        </div>
        {state.snapshot && !state.snapshot.active ? (
          <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">
                  {selected.length
                    ? `Building one investigation from ${selected.length} selected record${selected.length === 1 ? "" : "s"}`
                    : "Select a source record to continue"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Likely and ambiguous records stay separate until identity
                  evidence supports unification.
                </p>
              </div>
              <button
                disabled={!selected.length || starting}
                onClick={async () => {
                  setStarting(true);
                  try {
                    await onInvestigate(selected);
                  } finally {
                    setStarting(false);
                  }
                }}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-cyan-600 px-4 text-sm font-semibold disabled:opacity-45"
              >
                <IconTopologyStar3 className="h-4 w-4" />
                {starting
                  ? "Resolving selected structures..."
                  : "Start investigation"}
              </button>
            </div>
            {selected.length ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {selected.map((item) => (
                  <div
                    key={item.resultId}
                    className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2"
                  >
                    <p className="text-xs font-semibold text-slate-200">
                      {SOURCE_LABELS[item.source]} Â· {item.displayName}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-slate-500">
                      {item.nativeId}
                      {item.revision ? ` Â· Revision ${item.revision}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
        {recent.length ? (
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-[.15em] text-slate-500">
              Recent investigations
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((item) => (
                <a
                  key={item.id}
                  href={`/lattice?investigation=${encodeURIComponent(item.id)}`}
                  className="group rounded-2xl border border-slate-800 bg-slate-950/65 p-4 transition hover:border-cyan-500/40"
                >
                  <p className="truncate text-sm font-semibold text-slate-100">
                    {cleanInvestigationLabel(item.label)}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Saved engineering investigation
                  </p>
                  <span className="mt-4 inline-flex text-xs font-semibold text-cyan-300">
                    Resume investigation
                  </span>
                </a>
              ))}
            </div>
          </section>
        ) : null}
        <p className="sr-only" aria-live="polite">
          {state.announcement}
        </p>
      </section>
    </main>
  );
}

function SourceCard({
  source,
  query,
  outcome,
  included,
  searchActive,
  selected,
  onSelect,
  onRetry,
  onToggleSource,
}: {
  source: LatticeSource;
  query: string;
  outcome: SourceSearchOutcome | null;
  included: boolean;
  searchActive: boolean;
  selected: Set<string>;
  onSelect: (result: NormalizedSearchResult) => void;
  onRetry: () => void;
  onToggleSource: () => void;
}) {
  const [expanded, setExpanded] = useState(false),
    [details, setDetails] = useState(false),
    state = presentOutcome(source, included ? outcome : ({ source, status: "not-requested" } as SourceSearchOutcome), query),
    items = outcome?.results ?? [],
    visible = expanded ? items : items.slice(0, 3);
  const tones = {
    teamcenter: "text-cyan-300",
    windchill: "text-violet-300",
    sap: "text-emerald-300",
    configit: "text-fuchsia-300",
  };
  return (
    <section className={`rounded-2xl border border-slate-800 bg-slate-950/65 p-4 transition ${included ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={searchActive} onClick={onToggleSource} aria-pressed={included} aria-label={`${included ? "Exclude" : "Include"} ${SOURCE_LABELS[source]}`} className="rounded text-slate-400 disabled:opacity-40">
              {included ? <IconSquareCheckFilled className="h-5 w-5 text-cyan-400" /> : <IconSquare className="h-5 w-5" />}
            </button>
            <p className={`text-sm font-semibold ${tones[source]}`}>
              {SOURCE_LABELS[source]}
            </p>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${state.tone === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : state.tone === "warning" ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : state.tone === "active" ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300" : "border-slate-700 text-slate-400"}`}
            >
              {state.label}
            </span>
          </div>
          <h3 className="mt-2 text-sm font-semibold text-slate-100">
            {state.title}
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            {state.message}
          </p>
        </div>
        {state.actionLabel ? (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-cyan-300"
          >
            <IconRefresh className="h-3.5 w-3.5" />
            {state.actionLabel}
          </button>
        ) : null}
      </div>
      {included && visible.length ? (
        <div className="mt-4 grid gap-2">
          {visible.map((result) => (
            <button
              key={result.resultId}
              onClick={() => onSelect(result)}
              className={`rounded-xl border p-3 text-left transition ${selected.has(result.resultId) ? "border-cyan-400 bg-cyan-500/10" : "border-slate-800 bg-slate-900/55 hover:border-slate-700"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <strong className="block truncate text-sm">
                    {result.displayName}
                  </strong>
                  <p className="mt-1 text-xs text-slate-500">
                    {friendlyReference(source, result)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-slate-700 px-2 py-1 text-[9px] font-semibold text-slate-400">
                  {presentMatch(result.matchCategory)}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : null}
      {included && items.length > 3 ? (
        <button
          onClick={() => setExpanded((value) => !value)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-cyan-300"
        >
          {expanded ? (
            <>
              <IconChevronUp className="h-3.5 w-3.5" />
              Show fewer
            </>
          ) : (
            <>
              <IconChevronDown className="h-3.5 w-3.5" />
              Show all {items.length} results
            </>
          )}
        </button>
      ) : null}
      {included && state.technicalDetail ? (
        <div className="mt-3">
          <button
            onClick={() => setDetails((value) => !value)}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-300"
          >
            {details ? "Hide technical details" : "View technical details"}
          </button>
          {details ? (
            <p className="mt-2 rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[10px] leading-5 text-slate-500">
              {state.technicalDetail}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
function friendlyReference(
  source: LatticeSource,
  result: NormalizedSearchResult,
) {
  const revision = result.revision ? ` Â· Revision ${result.revision}` : "";
  if (source === "windchill")
    return `Part ${result.nativeId.replace(/^OR:wt\.part\.WTPart:/, "")}${revision}`;
  if (source === "sap") return `Material ${result.nativeId}${revision}`;
  if (source === "configit")
    return `Product ${result.nativeId}${result.version ? ` Â· Package version ${result.version}` : ""}`;
  return `Item ${result.nativeId}${revision}`;
}
