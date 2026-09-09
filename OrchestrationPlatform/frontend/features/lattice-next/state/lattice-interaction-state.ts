import type { XYPosition } from "@xyflow/react";
import type { InvestigationSelection } from "../domain/model";
import type { RendererViewport } from "../contracts/projection";
import type { BilateralLayoutMode } from "../layout/bilateral-layout-contract";

export type LatticeExpansionState = { expanded: Set<string>; focusRoot: string | null };
export type LatticeHoverState = { entityId: string | null; relationshipId: string | null };
export type LatticeAnimationState = { enteringNodeIds: Set<string>; activeEdgeIds: Set<string> };

/** UI-only interaction state. The canonical engineering graph is deliberately
 * absent from this type and remains immutable in the workspace/domain layer. */
export type LatticeInteractionState = {
  selection: InvestigationSelection;
  expansion: LatticeExpansionState;
  pinnedPositions: Record<string, XYPosition>;
  viewport: RendererViewport;
  hover: LatticeHoverState;
  animation: LatticeAnimationState;
  layoutMode: BilateralLayoutMode;
};

export function createInteractionState(roots: string[]): LatticeInteractionState {
  return {
    selection: roots[0] ? { type: "entity", id: roots[0] } : { type: "none" },
    expansion: { expanded: new Set(roots), focusRoot: null },
    pinnedPositions: {},
    viewport: { x: 0, y: 0, zoom: 1 },
    hover: { entityId: null, relationshipId: null },
    animation: { enteringNodeIds: new Set(), activeEdgeIds: new Set() },
    layoutMode: "DEFAULT",
  };
}
