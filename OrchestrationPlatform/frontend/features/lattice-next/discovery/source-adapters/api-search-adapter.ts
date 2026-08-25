import type { ItemSearchCandidate, SourceSearchResult } from "@/types/item-explorer";
import { SOURCE_CAPABILITIES } from "../capability-matrix";
import type { FederatedSearchRequest, LatticeSource, MatchCategory, NormalizedSearchResult, SourceSearchOutcome } from "../contracts";
import type { SourceSearchAdapter } from "./base";

function category(candidate: ItemSearchCandidate): MatchCategory {
  if (candidate.matchType === "exact-id") return candidate.providerMode === "live" ? "verified-identifier-match" : "source-native-reference";
  if (candidate.matchType === "exact-name") return "exact-normalized-name-match";
  if (candidate.matchType === "source-result" || candidate.matchType === "id-prefix") return "probable-match";
  return "ambiguous-candidate";
}

function normalize(source: LatticeSource, candidate: ItemSearchCandidate): NormalizedSearchResult {
  return {
    resultId: candidate.candidateId,
    source,
    nativeId: candidate.nativeId,
    displayName: candidate.name,
    entityType: candidate.context.objectType ?? "engineering-record",
    revision: candidate.context.revision,
    version: candidate.context.version,
    lifecycleState: candidate.context.lifecycleState,
    description: candidate.description,
    matchCategory: category(candidate),
    matchReason: candidate.matchReasons.join(" ") || "Returned by the source connector.",
    capabilityHints: [],
    sourceMetadata: Object.fromEntries(Object.entries(candidate.context).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    provenance: {
      providerMode: candidate.providerMode === "live" ? "live" : "capability",
      retrievedAt: candidate.retrievedAt,
      sourceRoute: `/api/item-explorer/search/${source}`,
    },
    canStartInvestigation: Boolean(candidate.nativeId),
  };
}

export class ApiSearchAdapter implements SourceSearchAdapter {
  constructor(readonly source: LatticeSource) {}

  async search(request: FederatedSearchRequest, signal: AbortSignal): Promise<SourceSearchOutcome> {
    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    const capability = SOURCE_CAPABILITIES[this.source];
    const mode = request.queryIntent === "product-name" && capability.supportsNameSearch ? "name" : "item-id";
    const response = await fetch(`/api/item-explorer/search/${this.source}?query=${encodeURIComponent(request.query)}&mode=${mode}&limit=${Math.min(request.resultLimitPerSource, capability.resultLimit)}`, { cache: "no-store", signal });
    let payload: SourceSearchResult;
    try { payload = await response.json() as SourceSearchResult; }
    catch { throw new Error(`${this.source} returned a malformed response.`); }
    const results = (payload.candidates ?? []).map((candidate) => normalize(this.source, candidate));
    const state = payload.status === "complete" ? (results.length ? "succeeded" : "empty") : payload.status === "empty" ? "empty" : payload.status === "unsupported" ? "unavailable" : payload.status === "timed-out" ? "timed-out" : payload.status === "cancelled" ? "cancelled" : "failed";
    return {
      source: this.source,
      requestId: request.requestId,
      status: state,
      results,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      warning: payload.capabilityNote,
      error: state === "failed" ? { code: "connector-error", message: payload.error ?? `${this.source} search failed.` } : undefined,
      retryable: state === "failed" || state === "timed-out",
      capabilitySnapshot: capability,
    };
  }
}
