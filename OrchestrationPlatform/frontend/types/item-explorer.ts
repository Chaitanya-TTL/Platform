export type EnterpriseSource = "teamcenter" | "windchill" | "sap" | "configit";
export type SearchMode = "name" | "item-id";
export type MatchType = "exact-name" | "name-contains" | "description-match" | "exact-id" | "id-prefix" | "nearby-id" | "source-result";
export type SourceSearchStatus = "idle" | "searching" | "complete" | "empty" | "failed" | "timed-out" | "cancelled" | "unsupported";
export type SelectionScope = "session" | "user" | "team" | "project" | "approved-enterprise";
export interface CandidateContext { revision?: string; version?: string; lifecycleState?: string; plant?: string; organization?: string; configuration?: string; objectType?: string; }
export interface ItemSearchCandidate { candidateId: string; source: EnterpriseSource; nativeId: string; name: string; description?: string; matchType: MatchType; matchScore?: number; matchReasons: string[]; context: CandidateContext; retrievedAt: string; providerMode: "live" | "capability" | "fixture"; }
export interface SourceCapabilities { nameSearch: boolean; itemIdSearch: boolean; nearbyIds: boolean; live: boolean; }
export interface SourceSearchResult { source: EnterpriseSource; status: SourceSearchStatus; candidates: ItemSearchCandidate[]; durationMs: number; capabilityNote?: string; error?: string; capabilities: SourceCapabilities; }
export interface FederatedSearchResponse { searchId: string; query: string; mode: SearchMode; interpretedAs: string; startedAt: string; results: SourceSearchResult[]; }
export interface ResolvedSelection { source: EnterpriseSource; candidate: ItemSearchCandidate; selectedBy: "user" | "exact-cross-reference" | "approved-rule"; selectedAt: string; selectionScope: SelectionScope; }
export type ResolvedItemContext = Partial<Record<EnterpriseSource, ResolvedSelection>>;
export type ItemExplorerPhase = "search" | "results" | "workspace";
