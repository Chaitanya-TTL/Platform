import type { XYPosition } from "@xyflow/react";
import type { LayoutOrientation, RendererViewport } from "../contracts/projection";
import type { RelationshipKind } from "../domain/model";
import { createInteractionState, type LatticeInteractionState } from "./lattice-interaction-state";

export type InvestigationState = {
  interaction: LatticeInteractionState;
  query: string;
  inspectorOpen: boolean;
  revision: 3;
  activeSources: Set<string>;
  activeRelationships: Set<RelationshipKind>;
  orientation: LayoutOrientation;
};

export type InvestigationAction =
  | { type: "select-entity"; id: string }
  | { type: "select-relationship"; id: string }
  | { type: "clear-transient" }
  | { type: "toggle"; id: string }
  | { type: "query"; value: string }
  | { type: "viewport"; value: RendererViewport }
  | { type: "pin-position"; id: string; position: XYPosition }
  | { type: "unpin-position"; id: string }
  | { type: "reset-layout" }
  | { type: "bilateral-reflow"; positions: Record<string, XYPosition> }
  | { type: "reset-selected" }
  | { type: "hover-entity"; id: string | null }
  | { type: "hover-relationship"; id: string | null }
  | { type: "focus"; id: string | null }
  | { type: "source"; value: string }
  | { type: "relationship"; value: RelationshipKind }
  | { type: "expand-many"; ids: string[] }
  | { type: "collapse-many"; ids: string[] }
  | { type: "orientation"; value: LayoutOrientation }
  | { type: "start-new-investigation" }
  | { type: "open-inspector" }
  | { type: "close-inspector" }
  | { type: "toggle-inspector" };

export function initialInvestigation(roots: string[], sources: string[]): InvestigationState {
  return {
    interaction: createInteractionState(roots),
    query: "",
    inspectorOpen: true,
    revision: 3,
    activeSources: new Set(sources),
    activeRelationships: new Set(["contains", "corresponds-to"]),
    orientation: "RIGHT",
  };
}

export function investigationReducer(state: InvestigationState, action: InvestigationAction): InvestigationState {
  switch (action.type) {
    case "start-new-investigation":
      return {
        ...state,
        query: "",
        inspectorOpen: false,
        interaction: {
          ...createInteractionState([]),
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      };
    case "open-inspector": return { ...state, inspectorOpen: true };
    case "close-inspector": return { ...state, inspectorOpen: false };
    case "toggle-inspector": return { ...state, inspectorOpen: !state.inspectorOpen };
    case "select-entity":
      return { ...state, interaction: { ...state.interaction, selection: { type: "entity", id: action.id } }, inspectorOpen: true };
    case "select-relationship":
      return { ...state, interaction: { ...state.interaction, selection: { type: "relationship", id: action.id } }, inspectorOpen: true };
    case "clear-transient":
      return {
        ...state,
        interaction: {
          ...state.interaction,
          selection: { type: "none" },
          hover: { entityId: null, relationshipId: null },
          animation: { enteringNodeIds: new Set(), activeEdgeIds: new Set() },
        },
      };
    case "query":
      return { ...state, query: action.value };
    case "viewport":
      return { ...state, interaction: { ...state.interaction, viewport: action.value } };
    case "pin-position":
      return { ...state, interaction: { ...state.interaction, pinnedPositions: { ...state.interaction.pinnedPositions, [action.id]: action.position } } };
    case "unpin-position": {
      const pinnedPositions = { ...state.interaction.pinnedPositions };
      delete pinnedPositions[action.id];
      return { ...state, interaction: { ...state.interaction, pinnedPositions } };
    }
    case "reset-layout":
      return { ...state, interaction: { ...state.interaction, pinnedPositions: {}, layoutMode: "DEFAULT" } };
    case "bilateral-reflow":
      return { ...state, interaction: { ...state.interaction, pinnedPositions: action.positions, layoutMode: "BILATERAL" } };
    case "reset-selected": {
      const selection = state.interaction.selection;
      if (selection.type !== "entity") return state;
      const pinnedPositions = { ...state.interaction.pinnedPositions };
      delete pinnedPositions[selection.id];
      return { ...state, interaction: { ...state.interaction, pinnedPositions } };
    }
    case "hover-entity":
      return { ...state, interaction: { ...state.interaction, hover: { ...state.interaction.hover, entityId: action.id } } };
    case "hover-relationship":
      return { ...state, interaction: { ...state.interaction, hover: { ...state.interaction.hover, relationshipId: action.id } } };
    case "focus":
      return { ...state, interaction: { ...state.interaction, expansion: { ...state.interaction.expansion, focusRoot: action.id } } };
    case "orientation":
      return { ...state, orientation: action.value };
    case "source": {
      const activeSources = new Set(state.activeSources);
      if (activeSources.has(action.value)) activeSources.delete(action.value); else activeSources.add(action.value);
      return { ...state, activeSources };
    }
    case "relationship": {
      const activeRelationships = new Set(state.activeRelationships);
      if (activeRelationships.has(action.value)) activeRelationships.delete(action.value); else activeRelationships.add(action.value);
      return { ...state, activeRelationships };
    }
    case "expand-many": { const expanded=new Set(state.interaction.expansion.expanded); action.ids.forEach((id)=>expanded.add(id)); return {...state,interaction:{...state.interaction,expansion:{...state.interaction.expansion,expanded}}}; }
    case "collapse-many": { const expanded=new Set(state.interaction.expansion.expanded); action.ids.forEach((id)=>expanded.delete(id)); return {...state,interaction:{...state.interaction,expansion:{...state.interaction.expansion,expanded}}}; }
    case "toggle": {
      const expanded = new Set(state.interaction.expansion.expanded);
      if (expanded.has(action.id)) expanded.delete(action.id); else expanded.add(action.id);
      return { ...state, interaction: { ...state.interaction, expansion: { ...state.interaction.expansion, expanded } } };
    }
  }
}
