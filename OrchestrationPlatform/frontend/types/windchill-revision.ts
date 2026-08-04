import type { TreeNodeData } from "@/types/bom-comparison";

export type WindchillVersion = {
  label: string;
  display: string;
  partId: string;
  numericPartId: string;
  revision?: string | null;
  latest: boolean;
  name?: string | null;
  number?: string | null;
  view?: string | null;
};

export type WindchillVersionList = {
  productId: string;
  versions: WindchillVersion[];
  generatedAt: string;
  source: "windchill-api";
};

export type WindchillRevisionStatus =
  | "added"
  | "removed"
  | "moved"
  | "changed"
  | "unchanged";

export type WindchillRevisionDifference = {
  field: "name" | "quantity" | "parent";
  from?: unknown;
  to?: unknown;
};

export type WindchillRevisionChange = {
  status: WindchillRevisionStatus;
  itemId: string;
  fromPath?: string | null;
  toPath?: string | null;
  differences: WindchillRevisionDifference[];
};

export type WindchillRevisionSummary = Record<WindchillRevisionStatus, number>;

export type WindchillStructureDocument = {
  productId: string;
  productName: string;
  generatedDate: string;
  version?: WindchillVersion | null;
  bom: unknown[];
  source: "windchill-api";
};

export type WindchillRevisionComparisonResult = {
  productId: string;
  fromVersion: WindchillVersion;
  toVersion: WindchillVersion;
  summary: WindchillRevisionSummary;
  fromTree: WindchillStructureDocument;
  toTree: WindchillStructureDocument;
  fromMap: Record<string, WindchillRevisionChange>;
  toMap: Record<string, WindchillRevisionChange>;
  changes: WindchillRevisionChange[];
  generatedAt: string;
};

export type WindchillRevisionTrees = {
  fromRoot: TreeNodeData;
  toRoot: TreeNodeData;
};
