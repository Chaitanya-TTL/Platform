import type { InvestigationState } from "../state/investigation-reducer";
import type { InvestigationGraph, InvestigationSelection, RelationshipKind } from "../domain/model";
import { initialInvestigation } from "../state/investigation-reducer";
import { LATTICE_LAYOUT_REVISION } from "../layout/layout-contract";

const VERSION = 4;
const key = (id: string) => `lattice-next:investigation:${id}`;

export function saveInvestigation(id: string, state: InvestigationState) {
  try {
    localStorage.setItem(key(id), JSON.stringify({
      ...state,
      version: VERSION,
      layoutRevision: LATTICE_LAYOUT_REVISION,
      activeSources: [...state.activeSources],
      activeRelationships: [...state.activeRelationships],
      interaction: {
        ...state.interaction,
        expansion: {
          ...state.interaction.expansion,
          expanded: [...state.interaction.expansion.expanded],
        },
        animation: {
          enteringNodeIds: [...state.interaction.animation.enteringNodeIds],
          activeEdgeIds: [...state.interaction.animation.activeEdgeIds],
        },
      },
    }));
    return true;
  } catch {
    return false;
  }
}

function validSelection(value: unknown, graph: InvestigationGraph): InvestigationSelection {
  const selection = value as InvestigationSelection | undefined;
  if (selection?.type === "entity" && graph.byId[selection.id]) return selection;
  if (selection?.type === "relationship" && graph.relationshipById[selection.id]) return selection;
  return { type: "none" };
}

export function loadInvestigation(id: string, graph: InvestigationGraph, sources: string[]): InvestigationState | null {
  try {
    const raw = localStorage.getItem(key(id));
    if (!raw) return null;
    const value = JSON.parse(raw) as Record<string, unknown>;
    const fallback = initialInvestigation(graph.roots, sources);

    // Safe migration from the pre-BM-1 flat version-2 interaction structure.
    if (value.version === 2) {
      const expanded = Array.isArray(value.expanded) ? value.expanded : [];
      const activeSources = Array.isArray(value.activeSources) ? value.activeSources : [];
      const activeRelationships = Array.isArray(value.activeRelationships) ? value.activeRelationships : [];
      return {
        ...fallback,
        query: typeof value.query === "string" ? value.query : "",
        inspectorOpen: value.inspectorOpen !== false,
        orientation: value.orientation === "DOWN" ? "DOWN" : "RIGHT",
        activeSources: new Set(activeSources.filter((item): item is string => typeof item === "string" && sources.includes(item))),
        activeRelationships: new Set(activeRelationships.filter((item): item is RelationshipKind => typeof item === "string")) as Set<RelationshipKind>,
        interaction: {
          ...fallback.interaction,
          selection: validSelection(value.selection, graph),
          expansion: {
            expanded: new Set(expanded.filter((item): item is string => typeof item === "string" && Boolean(graph.byId[item]))),
            focusRoot: typeof value.focusRoot === "string" && graph.byId[value.focusRoot] ? value.focusRoot : null,
          },
          viewport: value.viewport && typeof value.viewport === "object" ? value.viewport as InvestigationState["interaction"]["viewport"] : fallback.interaction.viewport,
        },
      };
    }

    if (value.version === 3 && value.interaction && typeof value.interaction === "object") {
      value.version = VERSION;
      value.layoutRevision = LATTICE_LAYOUT_REVISION;
      value.interaction = { ...(value.interaction as Record<string, unknown>), pinnedPositions: {} };
    }

    if (value.version !== VERSION || value.layoutRevision !== LATTICE_LAYOUT_REVISION || !value.interaction || typeof value.interaction !== "object") return null;
    const restored = value as unknown as Omit<InvestigationState, "activeSources" | "activeRelationships"> & {
      activeSources: string[];
      activeRelationships: RelationshipKind[];
      interaction: Omit<InvestigationState["interaction"], "expansion" | "animation"> & {
        expansion: { expanded: string[]; focusRoot: string | null };
        animation: { enteringNodeIds: string[]; activeEdgeIds: string[] };
      };
    };
    return {
      ...restored,
      revision: 3,
      activeSources: new Set(restored.activeSources.filter((source) => sources.includes(source))),
      activeRelationships: new Set(restored.activeRelationships),
      interaction: {
        ...restored.interaction,
        selection: validSelection(restored.interaction.selection, graph),
        pinnedPositions: Object.fromEntries(Object.entries(restored.interaction.pinnedPositions ?? {}).filter(([nodeId]) => Boolean(graph.byId[nodeId]))),
        expansion: {
          focusRoot: restored.interaction.expansion.focusRoot && graph.byId[restored.interaction.expansion.focusRoot] ? restored.interaction.expansion.focusRoot : null,
          expanded: new Set(restored.interaction.expansion.expanded.filter((nodeId) => Boolean(graph.byId[nodeId]))),
        },
        animation: {
          enteringNodeIds: new Set(),
          activeEdgeIds: new Set(),
        },
      },
    };
  } catch {
    return null;
  }
}
