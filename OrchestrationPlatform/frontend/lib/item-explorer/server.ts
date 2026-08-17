import type { EnterpriseSource, SearchMode, SourceCapabilities, SourceSearchResult } from "@/types/item-explorer";
export function result(source: EnterpriseSource, status: SourceSearchResult["status"], durationMs: number, overrides: Partial<SourceSearchResult> = {}): SourceSearchResult {
  const capabilities: Record<EnterpriseSource, SourceCapabilities> = {
    teamcenter: { nameSearch: false, itemIdSearch: true, nearbyIds: false, live: false },
    windchill: { nameSearch: true, itemIdSearch: true, nearbyIds: false, live: true },
    sap: { nameSearch: true, itemIdSearch: true, nearbyIds: true, live: true },
    configit: { nameSearch: false, itemIdSearch: true, nearbyIds: false, live: false },
  };
  return { source, status, candidates: [], durationMs, capabilities: capabilities[source], ...overrides };
}
export function params(request: Request): { query: string; mode: SearchMode; limit: number } {
  const url = new URL(request.url); const query = (url.searchParams.get("query") ?? "").trim();
  const mode: SearchMode = url.searchParams.get("mode") === "item-id" ? "item-id" : "name";
  const limit = Math.min(25, Math.max(1, Number(url.searchParams.get("limit") ?? 10) || 10));
  return { query, mode, limit };
}
export function json(payload: SourceSearchResult, status = 200) { return Response.json(payload, { status }); }
