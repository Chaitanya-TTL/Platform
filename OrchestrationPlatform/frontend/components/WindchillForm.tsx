"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  IconArrowRight,
  IconGitCompare,
  IconHistory,
  IconSearch,
  IconX,
} from "@tabler/icons-react";

type WindchillPartSearchResult = {
  partId: string;
  numericPartId: string;
  number?: string | null;
  name?: string | null;
  revision?: string | null;
  version?: string | null;
  state?: string | null;
  view?: string | null;
  latest: boolean;
};

type SearchResponse = {
  query: string;
  results: WindchillPartSearchResult[];
};

type Props = {
  onSubmit: (partId: string) => void;
  onLoadVersions: (partId: string) => void;
  onFindChanges: (partId: string) => void;
  isRunning: boolean;
  isVersionLoading: boolean;
  isChangeLoading: boolean;
  changeDisabled: boolean;
};

function directPartId(value: string) {
  const input = value.trim();
  if (/^OR:wt\.part\.WTPart:\d+$/i.test(input)) return input;
  if (/^\d+$/.test(input)) return input;
  return null;
}

function metadata(item: WindchillPartSearchResult) {
  return [item.number, item.version || item.revision, item.state, item.view]
    .filter(Boolean)
    .join(" · ");
}

export function WindchillForm({
  onSubmit,
  onLoadVersions,
  onFindChanges,
  isRunning,
  isVersionLoading,
  isChangeLoading,
  changeDisabled,
}: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<WindchillPartSearchResult | null>(null);
  const [results, setResults] = useState<WindchillPartSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const authoritativeId = useMemo(
    () => selected?.numericPartId || directPartId(query),
    [selected, query],
  );
  const busy = isRunning || isVersionLoading || isChangeLoading || searching;

  const performSearch = async () => {
    const value = query.trim();
    if (!value) {
      setError("Enter a product name, number, or Windchill ID");
      return;
    }
    setSearching(true);
    setSearched(false);
    setSelected(null);
    setResults([]);
    setError("");
    try {
      const response = await fetch(
        `/api/bom-windchill?operation=search&query=${encodeURIComponent(value)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as SearchResponse | { error?: string };
      if (!response.ok || !("results" in payload)) {
        throw new Error("error" in payload ? payload.error || "Product search failed" : "Product search failed");
      }
      setResults(payload.results);
      setSearched(true);
      if (payload.results.length === 1) setSelected(payload.results[0]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSearching(false);
    }
  };

  const extract = () => {
    const id = authoritativeId;
    if (id) {
      onSubmit(id);
      return;
    }
    void performSearch();
  };

  return (
    <motion.form
      onSubmit={(event) => {
        event.preventDefault();
        extract();
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-3"
    >
      <div className="rounded-[22px] border border-slate-700/80 bg-slate-900/70 p-4">
        <label htmlFor="windchill-product" className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Product
        </label>
        <div className="flex min-w-0 items-stretch overflow-hidden rounded-xl border border-slate-700 bg-slate-950/80 focus-within:border-cyan-500/70">
          <input
            id="windchill-product"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(null);
              setResults([]);
              setSearched(false);
              setError("");
            }}
            placeholder="Name, number, or ID"
            disabled={busy}
            className="h-11 min-w-0 flex-1 border-0 bg-transparent px-3.5 text-sm font-medium text-slate-100 outline-none placeholder:text-slate-600 disabled:opacity-60"
          />
          {!directPartId(query) ? (
            <button
              type="button"
              onClick={() => void performSearch()}
              disabled={busy || !query.trim()}
              className="inline-flex h-11 items-center gap-2 border-l border-slate-700 px-3.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-40"
            >
              <IconSearch className="h-4 w-4" />
              {searching ? "Searching" : "Search"}
            </button>
          ) : null}
          <button
            type="submit"
            disabled={busy || !authoritativeId}
            className="inline-flex h-11 items-center gap-2 border-l border-slate-700 bg-cyan-600 px-4 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500"
          >
            {isRunning ? "Extracting" : "Extract"}
            <IconArrowRight className="h-4 w-4" />
          </button>
        </div>

        {selected ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950/55 px-3.5 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-100">
                {selected.name || selected.number || selected.numericPartId}
              </p>
              <p className="mt-1 truncate text-[11px] text-slate-500">{metadata(selected)}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Clear selected product"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {!selected && results.length ? (
          <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/55 p-1.5">
            {results.map((result) => (
              <button
                key={result.partId}
                type="button"
                onClick={() => setSelected(result)}
                className="block w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-slate-800/80"
              >
                <span className="block truncate text-sm font-semibold text-slate-200">
                  {result.name || result.number || result.numericPartId}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-slate-500">{metadata(result)}</span>
              </button>
            ))}
          </div>
        ) : searched && !results.length ? (
          <p className="mt-3 text-xs text-slate-500">No matching products.</p>
        ) : null}

        <div className="mt-3 flex items-center gap-2 border-t border-slate-800 pt-3">
          <button
            type="button"
            disabled={busy || !authoritativeId}
            onClick={() => authoritativeId && onLoadVersions(authoritativeId)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 disabled:opacity-35"
          >
            <IconHistory className="h-3.5 w-3.5" />
            {isVersionLoading ? "Loading" : "Revisions"}
          </button>
          <button
            type="button"
            disabled={busy || changeDisabled || !authoritativeId}
            onClick={() => authoritativeId && onFindChanges(authoritativeId)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 disabled:opacity-35"
          >
            <IconGitCompare className="h-3.5 w-3.5" />
            {isChangeLoading ? "Scanning" : "Changes"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200">{error}</div>
      ) : null}
    </motion.form>
  );
}
