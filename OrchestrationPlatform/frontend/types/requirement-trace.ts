import type { SourceType, TreeNodeData } from "@/types/bom-comparison";

export type RequirementStatus = "draft" | "approved" | "superseded" | "implemented";
export type RequirementFieldChange = { field: string; before?: string; after?: string };
export type RequirementRevision = {
  id: string; revision: string; title: string; description: string;
  status: RequirementStatus; createdAt: string; author: string;
  changeReason?: string; changedFields?: RequirementFieldChange[];
};
export type PartRequirementRecord = {
  source: SourceType; bomId: string; partId: string; partName: string;
  aliases?: string[]; revisions: RequirementRevision[];
};
export type RequirementSourceResult = PartRequirementRecord & {
  loaded: boolean; nodeId?: string; confidence: number;
  matchReason: "exact-item-id" | "alias" | "normalized-name";
};
export type RequirementTraceResult = {
  selectedSource: SourceType; selectedNode: TreeNodeData;
  selectedPartId?: string; selectedPartName: string;
  sources: RequirementSourceResult[]; totalRevisions: number; generatedAt: string;
};
export type RequirementTraceSnapshot = {
  enabled: boolean; result: RequirementTraceResult | null; modalOpen: boolean;
  loadedBoms: Partial<Record<SourceType, TreeNodeData>>;
};
