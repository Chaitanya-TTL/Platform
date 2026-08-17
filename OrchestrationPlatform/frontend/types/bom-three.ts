import type { ComparisonStatus } from "@/types/bom-comparison";
import type { DataQualitySummary } from "@/types/bom-data-quality";
import type { VisualBomGraph, VisualBomNode } from "@/types/bom-visualization";

export type ThreePosition = [number, number, number];
export type ThreeSpacingMode = "compact" | "balanced" | "expanded";
export type ThreeLabelMode = "smart" | "branch" | "assemblies" | "all" | "none";
export type ThreeNodeSize = "small" | "medium" | "large";
export type ThreeFocusMode = "full" | "branch" | "descendants" | "root-path" | "neighbourhood";
export type ThreeCameraAction = "fit-all" | "fit-branch" | "focus-selected" | "reset" | null;
export type ThreeLens = "structure" | "comparison" | "requirements" | "impact" | "complexity" | "data-quality";
export type ThreeColorMode = "role" | "level" | "comparison" | "requirements" | "complexity" | "data-quality";
export type ThreeSizeMode = "role" | "uniform" | "children" | "descendants" | "complexity";
export type ThreeUnrelatedMode = "show" | "ghost" | "hide";
export type ThreeMatchedMode = "show" | "ghost" | "hide";

export type ThreeLayoutOptions = { spacing: ThreeSpacingMode };
export type PositionedThreeBomNode = VisualBomNode & {
  position: ThreePosition;
  branchIndex: number;
  complexityScore: number;
};
export type ThreeBomLayout = {
  graph: VisualBomGraph;
  nodes: PositionedThreeBomNode[];
  byId: Record<string, PositionedThreeBomNode>;
  maxExtent: number;
  center: ThreePosition;
};

export type BranchComparisonSummary = {
  total: number;
  matched: number;
  changed: number;
  missing: number;
  sourceOnly: number;
  probable: number;
  health: number;
  worstStatus?: ComparisonStatus;
};

export type RequirementCoverage = { linked: number; total: number; percentage: number };
export type ThreeBranchAnalytics = {
  node: VisualBomNode;
  branchShare: number;
  directChildren: number;
  totalDescendants: number;
  leafDescendants: number;
  complexity: number;
  comparison: BranchComparisonSummary;
  requirementCoverage: RequirementCoverage;
  qualityFindingCount: number;
  summary: string[];
};

export type ThreeSearchResult = { nodeId: string; score: number; matchedBy: string[] };
export type ThreeAnalysisSnapshot = {
  quality: DataQualitySummary;
  complexityByNode: Record<string, number>;
  comparisonByNode: Record<string, BranchComparisonSummary>;
  requirementCoverageByNode: Record<string, RequirementCoverage>;
  qualityCountByNode: Record<string, number>;
};

export type ThreeAnalysisMode = "structure" | "quantity" | "comparison" | "complexity" | "impact";
export type CameraPreset = "home" | "front" | "top" | "side" | "selection";
export type BomFinding = { id: string; nodeId: string; severity: "high" | "medium" | "low"; title: string; detail: string; category: "comparison" | "quality" | "complexity" | "structure" };
export type SavedViewpoint = { id: string; name: string; nodeId?: string; mode: ThreeAnalysisMode; explosion: number; createdAt: string };
