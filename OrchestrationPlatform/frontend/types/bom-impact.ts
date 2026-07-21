import type { SourceType, TreeNodeData } from "@/types/bom-comparison";
export type ImpactMatchReason = "exact-item-id" | "exact-normalized-name";
export type ImpactOccurrence = {
  source: SourceType;
  nodeId: string;
  name: string;
  itemId?: string;
  quantity?: string;
  revision?: string;
  parentName?: string;
  path: string[];
  matchReason: ImpactMatchReason;
  confidence: number;
};
export type ImpactBomResult = {
  source: SourceType;
  found: boolean;
  occurrences: ImpactOccurrence[];
};
export type CrossBomImpactResult = {
  selectedSource: SourceType;
  selectedNodeId: string;
  selectedName: string;
  selectedItemId?: string;
  searchedSources: SourceType[];
  foundSources: SourceType[];
  missingSources: SourceType[];
  totalOccurrences: number;
  results: ImpactBomResult[];
  occurrences: ImpactOccurrence[];
  observations: string[];
  generatedAt: string;
};
export type ImpactStoreSnapshot = {
  enabled: boolean;
  result: CrossBomImpactResult | null;
  loadedBoms: Partial<Record<SourceType, TreeNodeData>>;
};
