import { NextRequest } from "next/server";
import { GET as windchill } from "@/app/api/bom-windchill/route";
import { json, params, result } from "@/lib/item-explorer/server";
import type { ItemSearchCandidate } from "@/types/item-explorer";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const started = Date.now(), { query, mode, limit } = params(request);
  if (!query) return json(result("windchill", "failed", 0, { error: "Enter an item name or identifier." }), 400);
  try {
    const nested = new NextRequest(new URL(`/api/bom-windchill?operation=search&query=${encodeURIComponent(query)}`, request.url));
    const response = await windchill(nested); const payload = await response.json() as { results?: Array<Record<string, unknown>>; error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Windchill search failed.");
    const candidates: ItemSearchCandidate[] = (payload.results ?? []).slice(0, limit).map((item, index) => {
      const nativeId = String(item.number ?? item.numericPartId ?? item.partId ?? `result-${index + 1}`);
      const name = String(item.name ?? nativeId); const exactId = nativeId.toLowerCase() === query.toLowerCase(); const exactName = name.toLowerCase() === query.toLowerCase();
      return { candidateId: `windchill:${String(item.partId ?? nativeId)}`, source: "windchill", nativeId, name,
        description: String(item.objectType ?? "Windchill part"), matchType: exactId ? "exact-id" : exactName ? "exact-name" : mode === "item-id" ? "id-prefix" : "source-result",
        matchScore: exactId || exactName ? 100 : undefined, matchReasons: [exactId ? "The Windchill number matches exactly." : exactName ? "The Windchill name matches exactly." : "Returned by the live Windchill product search."],
        context: { revision: String(item.revision ?? "") || undefined, version: String(item.version ?? "") || undefined, lifecycleState: String(item.state ?? "") || undefined, objectType: String(item.objectType ?? "") || undefined },
        retrievedAt: new Date().toISOString(), providerMode: "live" };
    });
    return json(result("windchill", candidates.length ? "complete" : "empty", Date.now() - started, { candidates, capabilityNote: "Live Windchill name and number search." }));
  } catch (error) { return json(result("windchill", "failed", Date.now() - started, { error: error instanceof Error ? error.message : "Windchill search failed.", capabilityNote: "Windchill did not return a usable search response." }), 502); }
}
