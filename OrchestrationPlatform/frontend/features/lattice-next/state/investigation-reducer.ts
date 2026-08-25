import type {
  LayoutOrientation,
  RendererViewport,
} from "../contracts/projection";
import type {
  InvestigationSelection,
  RelationshipKind,
} from "../domain/model";

export type InvestigationState = {
  selection: InvestigationSelection;
  expanded: Set<string>;
  query: string;
  viewport: RendererViewport;
  inspectorOpen: boolean;
  revision: 2;
  focusRoot: string | null;
  activeSources: Set<string>;
  activeRelationships: Set<RelationshipKind>;
  orientation: LayoutOrientation;
};

export type InvestigationAction =
  | { type: "select-entity"; id: string }
  | { type: "select-relationship"; id: string }
  | { type: "toggle"; id: string }
  | { type: "query"; value: string }
  | { type: "viewport"; value: RendererViewport }
  | { type: "focus"; id: string | null }
  | { type: "source"; value: string }
  | { type: "relationship"; value: RelationshipKind }
  | { type: "orientation"; value: LayoutOrientation };

export function initialInvestigation(
  roots: string[],
  sources: string[],
): InvestigationState {
  return {
    selection: roots[0]
      ? { type: "entity", id: roots[0] }
      : { type: "none" },
    expanded: new Set(roots),
    query: "",
    viewport: { x: 0, y: 0, zoom: 1 },
    inspectorOpen: true,
    revision: 2,
    focusRoot: null,
    activeSources: new Set(sources),
    activeRelationships: new Set(["contains", "corresponds-to"]),
    orientation: "RIGHT",
  };
}

export function investigationReducer(
  state: InvestigationState,
  action: InvestigationAction,
): InvestigationState {
  switch (action.type) {
    case "select-entity":
      return {
        ...state,
        selection: { type: "entity", id: action.id },
        inspectorOpen: true,
      };

    case "select-relationship":
      return {
        ...state,
        selection: { type: "relationship", id: action.id },
        inspectorOpen: true,
      };

    case "query":
      return {
        ...state,
        query: action.value,
      };

    case "viewport":
      return {
        ...state,
        viewport: action.value,
      };

    case "focus":
      return {
        ...state,
        focusRoot: action.id,
      };

    case "orientation":
      return {
        ...state,
        orientation: action.value,
      };

    case "source": {
      const activeSources = new Set(state.activeSources);

      if (activeSources.has(action.value)) {
        activeSources.delete(action.value);
      } else {
        activeSources.add(action.value);
      }

      return {
        ...state,
        activeSources,
      };
    }

    case "relationship": {
      const activeRelationships = new Set(state.activeRelationships);

      if (activeRelationships.has(action.value)) {
        activeRelationships.delete(action.value);
      } else {
        activeRelationships.add(action.value);
      }

      return {
        ...state,
        activeRelationships,
      };
    }

    case "toggle": {
      const expanded = new Set(state.expanded);

      if (expanded.has(action.id)) {
        expanded.delete(action.id);
      } else {
        expanded.add(action.id);
      }

      return {
        ...state,
        expanded,
      };
    }
  }
}