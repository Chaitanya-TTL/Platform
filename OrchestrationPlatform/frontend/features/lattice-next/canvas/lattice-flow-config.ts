import type {
  DefaultEdgeOptions,
  FitViewOptions,
  NodeTypes,
  EdgeTypes,
  SnapGrid,
} from "@xyflow/react";
import {
  InvestigationSubjectNode,
  PremiumEngineeringNode,
  SourceRepresentationNodeView,
} from "../components/PremiumNodes";
import type { LatticeFlowNode } from "./lattice-flow-types";
import { IntelligentRelationshipEdge } from "../components/IntelligentRelationshipEdge";
export const LATTICE_NODE_TYPES = {
  subject: InvestigationSubjectNode,
  "source-representation": SourceRepresentationNodeView,
  "engineering-item": PremiumEngineeringNode,
  evidence: PremiumEngineeringNode,
  change: PremiumEngineeringNode,
  requirement: PremiumEngineeringNode,
  "pending-source": SourceRepresentationNodeView,
  "unavailable-source": SourceRepresentationNodeView,
  cluster: PremiumEngineeringNode,
} satisfies NodeTypes;
export const LATTICE_EDGE_TYPES = {
  "lattice-edge": IntelligentRelationshipEdge,
} satisfies EdgeTypes;
export const LATTICE_FIT_VIEW_OPTIONS: FitViewOptions<LatticeFlowNode> = {
  padding: 0.16,
  minZoom: 0.2,
  maxZoom: 1.8,
  duration: 320,
  interpolate: "smooth",
};
export const LATTICE_DEFAULT_EDGE_OPTIONS: DefaultEdgeOptions = {
  selectable: true,
  focusable: true,
  interactionWidth: 22,
};
export const LATTICE_SNAP_GRID: SnapGrid = [16, 16];
export const LATTICE_PAN_BUTTONS = [1, 2] as const;
export const LATTICE_PRO_OPTIONS = { hideAttribution: true } as const;
