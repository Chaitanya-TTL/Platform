import { json, params, result } from "@/lib/item-explorer/server";
import type { ItemSearchCandidate } from "@/types/item-explorer";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const started = Date.now(), { query, mode } = params(request);
  if (!query) return json(result("configit", "failed", 0, { error: "Enter a product name or ID." }), 400);
  if (mode === "name") return json(result("configit", "unsupported", Date.now() - started, { capabilityNote: "Name search is not available for this Configit connection. Search by Configit Product ID instead." }));
  const candidate: ItemSearchCandidate = { candidateId: `configit:${query}`, source: "configit", nativeId: query, name: query,
    description: "Configit Product ID pending solve verification", matchType: "exact-id", matchReasons: ["Entered as a Configit Product ID. The product is verified when details are retrieved."], context: {}, retrievedAt: new Date().toISOString(), providerMode: "capability" };
  return json(result("configit", "complete", Date.now() - started, { candidates: [candidate], capabilityNote: "Product ID retrieval is supported. The search operation does not run a full BOM solve." }));
}
