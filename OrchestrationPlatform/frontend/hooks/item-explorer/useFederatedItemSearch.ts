"use client";
import { useCallback, useRef, useState } from "react";
import { enterpriseSources } from "@/lib/item-explorer/source-meta";
import type { EnterpriseSource, FederatedSearchResponse, SearchMode, SourceSearchResult } from "@/types/item-explorer";
const capabilityDefaults: Record<EnterpriseSource, SourceSearchResult["capabilities"]> = {
  teamcenter: { nameSearch: false, itemIdSearch: true, nearbyIds: false, live: false }, windchill: { nameSearch: true, itemIdSearch: true, nearbyIds: false, live: true },
  sap: { nameSearch: true, itemIdSearch: true, nearbyIds: true, live: true }, configit: { nameSearch: false, itemIdSearch: true, nearbyIds: false, live: false },
};
const pending = (source: EnterpriseSource): SourceSearchResult => ({ source, status: "searching", candidates: [], durationMs: 0, capabilities: capabilityDefaults[source] });
export function useFederatedItemSearch() {
  const [data, setData] = useState<FederatedSearchResponse | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const controllers = useRef<Map<EnterpriseSource, AbortController>>(new Map()); const generation = useRef(0);
  const cancel = useCallback(() => { generation.current += 1; controllers.current.forEach((controller) => controller.abort()); controllers.current.clear(); setLoading(false); setData((current) => current ? { ...current, results: current.results.map((item) => item.status === "searching" ? { ...item, status: "cancelled" } : item) } : current); }, []);
  const search = useCallback(async (query: string, mode: SearchMode) => {
    cancel(); const run = generation.current; const initial: FederatedSearchResponse = { searchId: crypto.randomUUID(), query, mode, interpretedAs: mode === "name" ? `Item name “${query}”` : `Item ID “${query}”`, startedAt: new Date().toISOString(), results: enterpriseSources.map(pending) };
    setData(initial); setLoading(true); setError("");
    const execute = async (source: EnterpriseSource) => {
      const controller = new AbortController(); controllers.current.set(source, controller); const timeout = window.setTimeout(() => controller.abort("timeout"), 25000);
      try {
        const response = await fetch(`/api/item-explorer/search/${source}?query=${encodeURIComponent(query)}&mode=${mode}&limit=10`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as SourceSearchResult; if (generation.current !== run) return;
        const normalized: SourceSearchResult = response.ok ? payload : { ...payload, status: payload.status === "unsupported" ? "unsupported" : "failed" };
        setData((current) => current ? { ...current, results: current.results.map((item) => item.source === source ? normalized : item) } : current);
      } catch (cause) {
        if (generation.current !== run) return; const timedOut = controller.signal.aborted && controller.signal.reason === "timeout";
        setData((current) => current ? { ...current, results: current.results.map((item) => item.source === source ? { ...pending(source), status: (timedOut ? "timed-out" : "failed") as SourceSearchResult["status"], error: timedOut ? "Search timed out." : cause instanceof Error ? cause.message : "Search failed." } : item) } : current);
      } finally { window.clearTimeout(timeout); controllers.current.delete(source); }
    };
    await Promise.all(enterpriseSources.map(execute)); if (generation.current !== run) return null; setLoading(false);
    let final: FederatedSearchResponse | null = null; setData((current) => { final = current; return current; }); return final;
  }, [cancel]);
  const retrySource = useCallback(async (source: EnterpriseSource) => {
    if (!data) return; const controller = new AbortController(); controllers.current.set(source, controller); setData((current) => current ? { ...current, results: current.results.map((item) => item.source === source ? pending(source) : item) } : current);
    try { const response = await fetch(`/api/item-explorer/search/${source}?query=${encodeURIComponent(data.query)}&mode=${data.mode}&limit=10`, { cache: "no-store", signal: controller.signal }); const payload = await response.json() as SourceSearchResult; setData((current) => current ? { ...current, results: current.results.map((item) => item.source === source ? payload : item) } : current); }
    catch (cause) { setData((current) => current ? { ...current, results: current.results.map((item) => item.source === source ? { ...pending(source), status: "failed", error: cause instanceof Error ? cause.message : "Search failed." } : item) } : current); }
    finally { controllers.current.delete(source); }
  }, [data]);
  return { data, loading, error, search, retrySource, cancel, clear: () => { cancel(); setData(null); setError(""); } };
}
