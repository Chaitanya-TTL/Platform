import type { EnterpriseSource, ItemSearchCandidate, ResolvedItemContext, SearchMode, SourceSearchResult } from "@/types/item-explorer";
export type LatticePhase = "ready" | "searching" | "investigating";
export type LatticeLens = "identity" | "structure" | "change" | "business-impact" | "configuration" | "requirements" | "data-quality" | "timeline";
export type LatticeSourceState = SourceSearchResult;
export type LatticeSelection = ResolvedItemContext;
export type LatticeSearchMode = SearchMode;
export type LatticeCandidate = ItemSearchCandidate;
export type LatticeSource = EnterpriseSource;
export type LatticeInspectorTarget = { kind: "source"; source: EnterpriseSource } | { kind: "item" } | null;
