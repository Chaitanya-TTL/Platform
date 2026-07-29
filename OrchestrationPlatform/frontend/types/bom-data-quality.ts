export type DataQualitySeverity = "critical" | "warning" | "info";
export type DataQualityCategory =
  | "missing-item-id"
  | "missing-revision"
  | "missing-quantity"
  | "repeated-source-object"
  | "duplicate-sibling-name"
  | "empty-assembly"
  | "complex-branch"
  | "whitespace"
  | "long-label";

export type DataQualityFinding = {
  id: string;
  nodeId: string;
  sourceNodeId: string;
  category: DataQualityCategory;
  severity: DataQualitySeverity;
  title: string;
  detail: string;
  recommendation: string;
};

export type DataQualitySummary = {
  score: number;
  total: number;
  critical: number;
  warning: number;
  info: number;
  findings: DataQualityFinding[];
  findingIdsByNode: Record<string, string[]>;
};
