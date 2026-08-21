import type { EnterpriseSource } from "@/types/item-explorer";

export type LatticeSource = EnterpriseSource;
export type ConnectorReadiness = "ready" | "degraded" | "unavailable" | "authentication-required" | "capability-limited" | "unknown";
export type DiscoveryMode = "exact-id" | "name" | "number" | "material-catalog" | "product-id" | "contextual-handoff" | "unsupported";
export type QueryIntent = "exact-engineering-id" | "product-name" | "part-number" | "material-number" | "requirement-id" | "change-id" | "unknown";
export type SourceSearchState = "idle" | "checking-readiness" | "searching" | "succeeded" | "empty" | "partial" | "failed" | "unavailable" | "cancelled" | "timed-out";
export type MatchCategory = "verified-identifier-match" | "source-native-reference" | "deterministic-normalized-id-match" | "exact-normalized-name-match" | "structure-supported-probable-match" | "probable-match" | "ambiguous-candidate" | "unresolved";

export interface TimeoutPolicy { defaultMs: number; maximumMs: number; sourceLevel: true; }
export interface SourceCapability {
  source: LatticeSource; readiness: ConnectorReadiness; discoveryModes: DiscoveryMode[];
  supportsExactId: boolean; supportsNameSearch: boolean; supportsNumberSearch: boolean;
  supportsStructureExtraction: boolean; supportsRevisionContext: boolean; supportsChangeContext: boolean;
  supportsRequirements: boolean; supportsOperationalImpact: boolean; supportsConfigurationContext: boolean;
  supportsCancellation: boolean; supportsRetry: boolean; supportsPartialSuccess: boolean;
  resultLimit: number; timeoutPolicy: TimeoutPolicy; knownLimitations: string[];
}
export interface FederatedSearchRequest {
  requestId: string; query: string; normalizedQuery: string; queryIntent: QueryIntent;
  requestedSources: LatticeSource[]; resultLimitPerSource: number; startedAt: string; timeoutMs: number;
}
export interface NormalizedSearchResult {
  resultId: string; source: LatticeSource; nativeId: string; displayName: string; entityType: string;
  revision?: string; version?: string; lifecycleState?: string; description?: string;
  matchCategory: MatchCategory; matchReason: string; capabilityHints: string[];
  sourceMetadata: Record<string, string | number | boolean | null>;
  provenance: { providerMode: "live" | "capability"; retrievedAt: string; sourceRoute: string };
  canStartInvestigation: boolean;
}
export interface NormalizedSearchError { code: "timeout" | "cancelled" | "unavailable" | "malformed-response" | "connector-error"; message: string; safeDetail?: string; }
export interface SourceSearchOutcome {
  source: LatticeSource; requestId: string; status: SourceSearchState; results: NormalizedSearchResult[];
  startedAt: string; completedAt?: string; durationMs: number; warning?: string;
  error?: NormalizedSearchError; retryable: boolean; capabilitySnapshot: SourceCapability;
}
export interface FederatedSearchSnapshot { request: FederatedSearchRequest; outcomes: Record<LatticeSource, SourceSearchOutcome>; active: boolean; completedAt?: string; }

export interface IdentityEvidence { type: string; value: string; sourceResultId?: string; }
export type ConfidenceClass = "verified" | "deterministic" | "probable" | "ambiguous" | "unresolved";
export type CorrespondenceReviewState = "unreviewed" | "accepted" | "rejected" | "ambiguous" | "system-verified";
export interface CorrespondenceCandidate {
  correspondenceId: string; sourceResultIds: string[]; category: MatchCategory; reason: string;
  evidence: IdentityEvidence[]; confidenceClass: ConfidenceClass; reviewState: CorrespondenceReviewState;
  conflicts: string[]; createdBy: "system" | "user"; createdAt: string;
}
