"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { IconSearch, IconX } from "@tabler/icons-react";
import { StatefulButtonDemo } from "./StatefulButton";

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

type WindchillSearchResponse = {
  query: string;
  results: WindchillPartSearchResult[];
};

interface WindchillFormProps {
  onSubmit: (partId: string) => void;
  onLoadVersions?: (partId: string) => void;
  onFindChanges?: (partId: string) => void;
  isRunning: boolean;
  isVersionLoading?: boolean;
  isChangeLoading?: boolean;
  changeDisabled?: boolean;
}

function directPartId(value: string) {
  const trimmed = value.trim();
  if (/^OR:wt\.part\.WTPart:\d+$/i.test(trimmed)) return trimmed;
  if (/^\d+$/.test(trimmed)) return trimmed;
  return null;
}

export function WindchillForm({
  onSubmit,
  onLoadVersions,
  onFindChanges,
  isRunning,
  isVersionLoading = false,
  isChangeLoading = false,
  changeDisabled = false,
}: WindchillFormProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<WindchillPartSearchResult | null>(null);
  const [results, setResults] = useState<WindchillPartSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const busy = isRunning || isVersionLoading || isChangeLoading || searching;
  const actionId = selected?.numericPartId || directPartId(query);

  const validateQuery = () => {
    const value = query.trim();
    if (!value) {
      setError("Enter a product name, number, or Windchill ID");
      return null;
    }
    setError("");
    return value;
  };

  const search = async () => {
    const value = validateQuery();
    if (!value) return;
    setSearching(true);
    setSearched(false);
    setResults([]);
    setSelected(null);
    try {
      const response = await fetch(
        `/api/bom-windchill?operation=search&query=${encodeURIComponent(value)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as WindchillSearchResponse | { error?: string };
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

  const submit = () => {
    const value = validateQuery();
    if (!value) return;
    const id = selected?.numericPartId || directPartId(value);
    if (id) {
      onSubmit(id);
      return;
    }
    void search();
  };

  return (
    <motion.form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="space-y-4"
    >
      <div className="rounded-[24px] border border-slate-700/70 bg-slate-900/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <label htmlFor="windchill-product-search" className="mb-3 block text-sm font-semibold text-slate-100">
          Product name, number, or ID
        </label>

        <div className="flex items-stretch overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/90">
          <input
            id="windchill-product-search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(null);
              setResults([]);
              setSearched(false);
              setError("");
            }}
            placeholder="GATE, 0000003365, or 628915"
            disabled={busy}
            className="min-w-0 flex-1 border-0 bg-transparent px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void search()}
            disabled={busy}
            className="inline-flex items-center gap-2 border-l border-slate-700 px-4 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-45"
          >
            <IconSearch className="h-4 w-4" />
            {searching ? "Searching..." : "Search"}
          </button>
          <StatefulButtonDemo isLoading={isRunning} disabled={busy || !actionId} />
        </div>

        {selected ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-cyan-100">{selected.name || selected.number || selected.numericPartId}</p>
              <p className="mt-1 text-xs text-cyan-200/70">
                {[selected.number, selected.version || selected.revision, selected.state, selected.view].filter(Boolean).join(" · ")}
              </p>
            </div>
            <button type="button" onClick={() => setSelected(null)} aria-label="Clear selected Windchill product">
              <IconX className="h-4 w-4 text-cyan-200" />
            </button>
          </div>
        ) : null}

        {!selected && results.length ? (
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/75 p-2">
            <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Select a Windchill product</p>
            {results.map((result) => (
              <button
                key={result.partId}
                type="button"
                onClick={() => setSelected(result)}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-left transition hover:border-cyan-400/50 hover:bg-cyan-400/[.07]"
              >
                <span className="block truncate text-sm font-semibold text-slate-100">{result.name || "Unnamed part"}</span>
                <span className="mt-1 block text-xs text-slate-400">
                  {[result.number, result.version || result.revision, result.state, result.view].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
          </div>
        ) : searched && !results.length ? (
          <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-200">
            No Windchill products matched “{query.trim()}”.
          </div>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {onLoadVersions ? (
            <button
              type="button"
              disabled={busy || !actionId}
              onClick={() => actionId && onLoadVersions(actionId)}
              className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 disabled:opacity-45"
            >
              {isVersionLoading ? "Loading versions..." : "Load revision history"}
            </button>
          ) : null}

          {onFindChanges ? (
            <button
              type="button"
              disabled={busy || changeDisabled || !actionId}
              onClick={() => actionId && onFindChanges(actionId)}
              className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-100 disabled:opacity-45"
            >
              {isChangeLoading ? "Finding changes..." : "Find associated changes"}
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-200">{error}</div>
      ) : null}
    </motion.form>
  );
}
