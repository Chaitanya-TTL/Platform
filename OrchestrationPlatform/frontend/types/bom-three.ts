import type { VisualBomGraph, VisualBomNode } from "@/types/bom-visualization";

export type ThreePosition = [number, number, number];
export type ThreeAnalysisMode =
  | "structure"
  | "quantity"
  | "comparison"
  | "complexity"
  | "impact";
export type CameraPreset = "home" | "front" | "top" | "side" | "selection";

export type PositionedThreeBomNode = VisualBomNode & {
  compactPosition: ThreePosition;
  explodedPosition: ThreePosition;
  branchIndex: number;
  complexityScore: number;
};

export type ThreeBomLayout = {
  graph: VisualBomGraph;
  nodes: PositionedThreeBomNode[];
  byId: Record<string, PositionedThreeBomNode>;
  maxExtent: number;
};

export type BomFinding = {
  id: string;
  nodeId: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  category: "comparison" | "quality" | "complexity" | "structure";
};

export type SavedViewpoint = {
  id: string;
  name: string;
  nodeId?: string;
  mode: ThreeAnalysisMode;
  explosion: number;
  createdAt: string;
};
