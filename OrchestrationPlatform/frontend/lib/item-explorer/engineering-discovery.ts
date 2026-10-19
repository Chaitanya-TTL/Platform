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


const normalize = (value: unknown) => String(value ?? "").toLocaleLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
function classifyCodebeamer(query: string, candidate: ApiCandidate): { matchType: MatchType; reason: string; classification: "direct" | "contextual" | "unsupported" } {
  const needle = normalize(query);
  if (!needle) return { matchType: "source-result", reason: "No searchable query was supplied.", classification: "unsupported" };
  const directFields: Array<[string, unknown]> = [["requirement name", candidate.displayName], ["external key", candidate.sourceMetadata?.externalKey], ["native item ID", candidate.nativeId], ["description", candidate.description]];
  for (const [label, value] of directFields) {
    const haystack = normalize(value);
    if (haystack && (haystack.includes(needle) || needle.includes(haystack))) return { matchType: label.includes("ID") || label.includes("key") ? "exact-id" : "exact-name", reason: `Query matched the ${label}.`, classification: "direct" };
  }
  return { matchType: "source-result", reason: "No indexed requirement field explains this result.", classification: "unsupported" };
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
    const candidates: ItemSearchCandidate[] = (outcome.candidates ?? []).flatMap((candidate) => {
      const codebeamerMatch = source === "codebeamer" ? classifyCodebeamer(query, candidate) : undefined;
      if (codebeamerMatch?.classification === "unsupported" || !candidate.nativeId) return [];
      return [{
        candidateId: candidate.candidateId ?? `${source}:${candidate.nativeId}`,
        source,
        nativeId: candidate.nativeId,
        name: candidate.displayName ?? candidate.nativeId,
        description: candidate.description,
        matchType: codebeamerMatch?.matchType ?? matchType(candidate.matchCategory),
        matchReasons: [codebeamerMatch?.reason ?? candidate.matchReason ?? "Returned by the authoritative source adapter."],
        context: {
          revision: candidate.revision,
          version: candidate.version,
          lifecycleState: candidate.lifecycleState,
          objectType: candidate.entityType,
          plant: candidate.sourceMetadata?.plant ?? undefined,
          configuration: candidate.sourceMetadata?.packagePath ?? undefined,
          logicalPackagePath: candidate.sourceMetadata?.logicalPackagePath ?? undefined,
          resolvedPackagePath: candidate.sourceMetadata?.resolvedPackagePath ?? candidate.sourceMetadata?.packagePath ?? undefined,
          packageVersionId: candidate.sourceMetadata?.versionId ?? candidate.version ?? undefined,
          packageState: candidate.sourceMetadata?.packageState ?? candidate.lifecycleState ?? undefined,
          externalKey: candidate.sourceMetadata?.externalKey ?? undefined,
          projectId: candidate.sourceMetadata?.projectId ?? undefined,
          projectName: candidate.sourceMetadata?.projectName ?? undefined,
          trackerId: candidate.sourceMetadata?.trackerId ?? undefined,
          trackerName: candidate.sourceMetadata?.trackerName ?? undefined,
          classification: codebeamerMatch?.classification ?? candidate.sourceMetadata?.classification ?? undefined,
          catalogRevision: candidate.sourceMetadata?.catalogRevision ?? undefined,
          catalogStatus: candidate.sourceMetadata?.catalogStatus ?? undefined,
          catalogSynchronizedAt: candidate.sourceMetadata?.catalogSynchronizedAt ?? undefined,
          stale: candidate.sourceMetadata?.stale?.toLowerCase() === "true",
        },
        retrievedAt: candidate.provenance?.observedAt ?? new Date().toISOString(),
        providerMode: candidate.provenance?.kind === "live-source" ? "live" as const : "capability" as const,
      }];
    }).slice(0, limit);
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
