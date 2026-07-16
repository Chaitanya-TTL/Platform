import type { ComparisonStatus, SourceType } from "@/types/bom-comparison";

export type BomViewMode = "tree" | "constellation" | "three-dimensional" | "radial";

export type VisualBomNode = {
  id: string;
  source: SourceType;
  name: string;
  itemId?: string;
  quantity?: string;
  revision?: string;
  parentId?: string;
  childIds: string[];
  level: number;
  path: string[];
  isRoot: boolean;
  isAssembly: boolean;
  descendantCount: number;
  leafCount: number;
  siblingCount: number;
  comparisonStatus?: ComparisonStatus;
};

export type VisualBomEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  depth: number;
  quantity?: string;
  comparisonStatus?: ComparisonStatus;
};

export type VisualBomGraph = {
  rootId: string;
  nodes: VisualBomNode[];
  edges: VisualBomEdge[];
  byId: Record<string, VisualBomNode>;
  maxLevel: number;
};

export type PositionedVisualNode = VisualBomNode & {
  x: number;
  y: number;
  angle: number;
  nodeRadius: number;
};

export type GraphTransform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
};
