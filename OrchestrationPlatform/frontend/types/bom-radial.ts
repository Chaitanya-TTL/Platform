import type { VisualBomGraph, VisualBomNode } from "@/types/bom-visualization";

export type RadialAnalysisMode = "structure" | "quantity" | "comparison" | "complexity" | "impact";

export type RadialArcNode = VisualBomNode & {
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  branchWeight: number;
  contribution: number;
  relativeLevel: number;
};

export type RadialLayout = {
  graph: VisualBomGraph;
  focusId: string;
  nodes: RadialArcNode[];
  byId: Record<string, RadialArcNode>;
  totalWeight: number;
  maxRelativeLevel: number;
};

export type RadialFinding = {
  id: string;
  nodeId: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
};
