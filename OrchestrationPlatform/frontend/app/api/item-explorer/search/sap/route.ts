import { json, params, result } from "@/lib/item-explorer/server";
import type { ItemSearchCandidate } from "@/types/item-explorer";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const started = Date.now(), { query, mode, limit } = params(request);
  if (!query) return json(result("sap", "failed", 0, { error: "Enter a material name or identifier." }), 400);
  const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5212/api";
  try {
    const response = await fetch(`${api}/sap-material-catalog/search?query=${encodeURIComponent(query)}&mode=${mode}&limit=${limit}`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
    const payload = await response.json() as { materials?: Array<{ materialId?: string; description?: string }>; message?: string };
    if (!response.ok) throw new Error(payload.message ?? "SAP material catalogue search failed.");
    const candidates: ItemSearchCandidate[] = (payload.materials ?? []).map((item) => ({ candidateId: `sap:${item.materialId}`, source: "sap", nativeId: String(item.materialId), name: String(item.description || item.materialId), description: item.description,
      matchType: mode === "item-id" && String(item.materialId).toLowerCase() === query.toLowerCase() ? "exact-id" : mode === "item-id" ? "id-prefix" : "source-result",
      matchReasons: [mode === "item-id" ? "Returned from the SAP material catalogue by identifier." : "Returned from the SAP material catalogue by description or material number."], context: {}, retrievedAt: new Date().toISOString(), providerMode: "live" }));
    return json(result("sap", candidates.length ? "complete" : "empty", Date.now() - started, { candidates, capabilityNote: "Live search against the latest available SAP material catalogue." }));
  } catch (error) { return json(result("sap", "failed", Date.now() - started, { error: error instanceof Error ? error.message : "SAP material catalogue is unavailable.", capabilityNote: "Refresh the SAP material catalogue before using name search." }), 502); }
}
