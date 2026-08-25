import type { EnterpriseSource, ItemSearchCandidate, MatchType, SearchMode, SourceSearchResult } from "@/types/item-explorer";
import { result } from "./server";

type ApiCandidate = {
  candidateId?: string;
  nativeId?: string;
  displayName?: string;
  description?: string;
  revision?: string;
  version?: string;
  lifecycleState?: string;
  entityType?: string;
  matchCategory?: string;
  matchReason?: string;
  sourceMetadata?: Record<string, string | null>;
  provenance?: { kind?: string; observedAt?: string };
};
type ApiOutcome = {
  status?: string;
  candidates?: ApiCandidate[];
  warnings?: Array<{ message?: string }>;
  errors?: Array<{ userMessage?: string; message?: string }>;
  retryable?: boolean;
};
type ApiDiscoveryResult = { sources?: ApiOutcome[] };

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5212/api";
const timeoutMs = 30_000;

function matchType(category: string | undefined): MatchType {
  switch (category) {
    case "verified-identifier-match":
    case "deterministic-normalized-id-match":
    case "source-native-reference":
      return "exact-id";
    case "exact-source-name-match":
      return "exact-name";
    case "source-search-result":
      return "source-result";
    default:
      return "source-result";
  }
}

function status(value: string | undefined, count: number): SourceSearchResult["status"] {
  if (value === "success" || value === "partial-success") return count ? "complete" : "empty";
  if (value === "empty") return "empty";
  if (value === "timed-out") return "timed-out";
  if (value === "cancelled") return "cancelled";
  if (value === "capability-limited" || value === "unavailable") return "unsupported";
  return "failed";
}

export async function searchEngineeringSource(source: EnterpriseSource, query: string, mode: SearchMode, limit: number): Promise<Response> {
  const started = Date.now();
  if (!query) return Response.json(result(source, "failed", 0, { error: "Enter a product name or ID." }), { status: 400 });
  const requestId = crypto.randomUUID();
  const body = {
    schemaVersion: "1.0",
    requestId,
    correlationId: requestId,
    requestedSources: [source],
    query: {
      originalInput: query,
      productId: mode === "item-id" ? query : null,
      productName: mode === "name" ? query : null,
      identifierType: mode === "item-id" ? "product-id" : "product-name",
    },
    resultLimitPerSource: limit,
    timeoutPolicy: { timeoutMs, perSourceTimeoutMs: timeoutMs },
    initiatedAt: new Date().toISOString(),
  };
  try {
    const response = await fetch(`${API_BASE}/engineering/discovery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json() as ApiDiscoveryResult;
    const outcome = payload.sources?.[0];
    if (!response.ok || !outcome) throw new Error("The engineering discovery API returned no source outcome.");
    const candidates: ItemSearchCandidate[] = (outcome.candidates ?? []).map((candidate) => ({
      candidateId: candidate.candidateId ?? `${source}:${candidate.nativeId}`,
      source,
      nativeId: candidate.nativeId ?? "",
      name: candidate.displayName ?? candidate.nativeId ?? "Unknown record",
      description: candidate.description,
      matchType: matchType(candidate.matchCategory),
      matchReasons: [candidate.matchReason ?? "Returned by the authoritative source adapter."],
      context: {
        revision: candidate.revision,
        version: candidate.version,
        lifecycleState: candidate.lifecycleState,
        objectType: candidate.entityType,
        plant: candidate.sourceMetadata?.plant ?? undefined,
        configuration: candidate.sourceMetadata?.packagePath ?? undefined,
      },
      retrievedAt: candidate.provenance?.observedAt ?? new Date().toISOString(),
      providerMode: candidate.provenance?.kind === "live-source" ? "live" as const : "capability" as const,
    })).filter((candidate) => candidate.nativeId);
    const mappedStatus = status(outcome.status, candidates.length);
    const error = outcome.errors?.[0]?.userMessage ?? outcome.errors?.[0]?.message;
    const capabilityNote = outcome.warnings?.[0]?.message;
    return Response.json(result(source, mappedStatus, Date.now() - started, { candidates, error, capabilityNote }), {
      status: mappedStatus === "failed" ? 502 : 200,
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return Response.json(result(source, timedOut ? "timed-out" : "failed", Date.now() - started, {
      error: timedOut ? `${source} search timed out.` : error instanceof Error ? error.message : `${source} search failed.`,
    }), { status: timedOut ? 504 : 502 });
  }
}
