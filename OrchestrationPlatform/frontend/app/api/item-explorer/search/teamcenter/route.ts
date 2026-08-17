import { json, params, result } from "@/lib/item-explorer/server";
import type { ItemSearchCandidate } from "@/types/item-explorer";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const started = Date.now(), { query, mode } = params(request);
  if (!query) return json(result("teamcenter", "failed", 0, { error: "Enter an item name or identifier." }), 400);
  if (mode === "name") return json(result("teamcenter", "unsupported", Date.now() - started, { capabilityNote: "Name discovery is not exposed by the current Teamcenter connector. Use Item ID search for this source." }));
  const candidate: ItemSearchCandidate = { candidateId: `teamcenter:${query}`, source: "teamcenter", nativeId: query, name: query,
    description: "Teamcenter item identifier pending extraction verification", matchType: "exact-id", matchReasons: ["Entered as a Teamcenter source-native Item ID. The record is verified when details are retrieved."], context: {}, retrievedAt: new Date().toISOString(), providerMode: "capability" };
  return json(result("teamcenter", "complete", Date.now() - started, { candidates: [candidate], capabilityNote: "Exact Item ID is accepted. Name search requires a dedicated Teamcenter saved-query endpoint." }));
}
