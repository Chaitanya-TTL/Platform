
import type { NodePosition } from "../contracts/projection";

export const LATTICE_LAYOUT_REVISION = 2 as const;
export type CardinalDirection = "RIGHT" | "DOWN" | "LEFT" | "UP";
export type PortSide = "NORTH" | "EAST" | "SOUTH" | "WEST";
export type Size = { width: number; height: number };
export type Bounds = NodePosition & Size;
export type LayoutPort = { id: string; nodeId: string; side: PortSide; position: NodePosition; offsetPercent?: number; branchId?: string };
export type LayoutRoute = { edgeId: string; start: NodePosition; bends: NodePosition[]; end: NodePosition; family?: string; lane?: number; label?: NodePosition; fallback?: boolean };
export type LayoutBranch = {
  id: string;
  rootId: string;
  nodeIds: string[];
  edgeIds: string[];
  direction: CardinalDirection;
  angle: number;
  bounds: Bounds;
};
export type UniversalLayoutDiagnostics = {
  strategy: "sector-layered-v2";
  sourceCount: number;
  rings: number;
  iterations: number;
  collisionsResolved: number;
  elapsedMs: number;
  overlapCount: number;
  invalidCoordinateCount: number;
  fallbackBranches: number;
  nodeOverlapCount: number;
  branchOverlapCount: number;
  subjectIntrusionCount: number;
  invalidRouteCount: number;
  routing?: import("./relationship-router").RoutingDiagnostics;
  stability?: import("./layout-session").StabilityDiagnostics;
};
export type RadialLayoutConnection = { branchId: string; angle: number; sourceNodeId: string; targetNodeId: string; edgeId: string; source: LayoutPort; target: LayoutPort };
export type UniversalLayoutResult = {
  signal: number;
  revision: typeof LATTICE_LAYOUT_REVISION;
  positions: Record<string, NodePosition>;
  dimensions: Record<string, Size>;
  ports: Record<string, LayoutPort>;
  routes: Record<string, LayoutRoute>;
  branchBounds: Record<string, Bounds>;
  branches: LayoutBranch[];
  radialConnections: Record<string, RadialLayoutConnection>;
  diagnostics: UniversalLayoutDiagnostics;
};
export type LayoutViewport = {
  width: number;
  height: number;
  inspectorWidth?: number;
  toolbarHeight?: number;
  gutter?: number;
};

