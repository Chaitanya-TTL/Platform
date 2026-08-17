import { NextRequest } from "next/server";
import { enterpriseSources } from "@/lib/item-explorer/source-meta";
import type { FederatedSearchResponse, SourceSearchResult } from "@/types/item-explorer";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query") ?? ""; const mode = request.nextUrl.searchParams.get("mode") === "item-id" ? "item-id" : "name";
  const results = await Promise.all(enterpriseSources.map(async (source) => {
    const response = await fetch(new URL(`/api/item-explorer/search/${source}?query=${encodeURIComponent(query)}&mode=${mode}`, request.url), { cache: "no-store" });
    return await response.json() as SourceSearchResult;
  }));
  const payload: FederatedSearchResponse = { searchId: crypto.randomUUID(), query, mode, interpretedAs: mode === "name" ? `Item name “${query}”` : `Item ID “${query}”`, startedAt: new Date().toISOString(), results };
  return Response.json(payload);
}
