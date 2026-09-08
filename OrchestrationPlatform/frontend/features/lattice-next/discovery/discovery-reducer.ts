import type {
  CorrespondenceCandidate,
  FederatedSearchSnapshot,
  NormalizedSearchResult,
} from "./contracts";

export interface DiscoveryState {
  query: string;
  snapshot: FederatedSearchSnapshot | null;
  selectedResultIds: Set<string>;
  correspondences: CorrespondenceCandidate[];
  announcement: string;
  selectedSources: Set<import("./contracts").LatticeSource>;
}

export type DiscoveryAction =
  | { type: "query"; value: string }
  | { type: "snapshot"; value: FederatedSearchSnapshot | null }
  | { type: "select"; result: NormalizedSearchResult }
  | { type: "toggle-source"; source: import("./contracts").LatticeSource }
  | { type: "correspondences"; value: CorrespondenceCandidate[] }
  | { type: "review"; id: string; state: "accepted" | "rejected" }
  | { type: "reset" };

export const initialDiscoveryState: DiscoveryState = {
  query: "",
  snapshot: null,
  selectedResultIds: new Set(),
  correspondences: [],
  announcement: "Discovery ready.",
  selectedSources: new Set(["windchill", "sap"]),
};

export function discoveryReducer(
  state: DiscoveryState,
  action: DiscoveryAction,
): DiscoveryState {
  switch (action.type) {
    case "query":
      return { ...state, query: action.value };

    case "snapshot": {
      const completed = action.value
        ? Object.values(action.value.outcomes).filter(
            (item) =>
              !["checking-readiness", "searching", "idle"].includes(
                item.status,
              ),
          ).length
        : 0;
      const requested = action.value?.request.requestedSources.length ?? state.selectedSources.size;

      return {
        ...state,
        snapshot: action.value,
        announcement: action.value?.active
          ? `${completed} of ${requested} selected sources returned.`
          : "Federated search complete.",
      };
    }

    case "toggle-source": {
      const selectedSources = new Set(state.selectedSources);
      if (selectedSources.has(action.source)) selectedSources.delete(action.source); else selectedSources.add(action.source);
      const selectedResultIds = new Set([...state.selectedResultIds].filter((id) => {
        const result = state.snapshot ? Object.values(state.snapshot.outcomes).flatMap((value) => value.results).find((item) => item.resultId === id) : undefined;
        return !result || selectedSources.has(result.source);
      }));
      return { ...state, selectedSources, selectedResultIds, snapshot: null, announcement: `${action.source} ${selectedSources.has(action.source) ? "included" : "excluded"}. Run a new search.` };
    }
    case "select": {
      const next = new Set(state.selectedResultIds);

      if (next.has(action.result.resultId)) {
        next.delete(action.result.resultId);
      } else {
        next.add(action.result.resultId);
      }

      return {
        ...state,
        selectedResultIds: next,
        announcement: `${action.result.displayName} ${
          next.has(action.result.resultId) ? "selected" : "removed"
        }.`,
      };
    }

    case "correspondences":
      return { ...state, correspondences: action.value };

    case "review":
      return {
        ...state,
        correspondences: state.correspondences.map((item) =>
          item.correspondenceId === action.id
            ? { ...item, reviewState: action.state }
            : item,
        ),
      };

    case "reset":
      return initialDiscoveryState;
  }
}
