import type {
  CorrespondenceCandidate,
  FederatedSearchSnapshot,
  LatticeSource,
  NormalizedSearchResult,
} from "./contracts";

export interface DiscoveryState {
  query: string;
  snapshot: FederatedSearchSnapshot | null;
  activeSource: LatticeSource | null;
  sourceSelectionByUser: boolean;
  selectedResultIds: Set<string>;
  correspondences: CorrespondenceCandidate[];
  announcement: string;
  selectedSources: Set<LatticeSource>;
}

export type DiscoveryAction =
  | { type: "query"; value: string }
  | { type: "snapshot"; value: FederatedSearchSnapshot | null }
  | { type: "source-tab-selected"; source: LatticeSource }
  | { type: "select"; result: NormalizedSearchResult }
  | { type: "toggle-source"; source: LatticeSource }
  | { type: "correspondences"; value: CorrespondenceCandidate[] }
  | { type: "review"; id: string; state: "accepted" | "rejected" }
  | { type: "reset" };

export const initialDiscoveryState: DiscoveryState = {
  query: "",
  snapshot: null,
  activeSource: null,
  sourceSelectionByUser: false,
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
      if (!action.value) {
        return {
          ...state,
          snapshot: null,
          activeSource: null,
          sourceSelectionByUser: false,
          announcement: "Discovery ready.",
        };
      }

      const snapshot = action.value;
      const requestedSources = snapshot.request.requestedSources;
      const completed = requestedSources.filter((source) => {
        const status = snapshot.outcomes[source]?.status;
        return (
          status !== undefined &&
          !["checking-readiness", "searching", "idle"].includes(status)
        );
      }).length;
      const requestChanged =
        snapshot.request.requestId !== state.snapshot?.request.requestId;
      const sourceResults = (source: LatticeSource) =>
        snapshot.outcomes[source]?.results ?? [];
      let activeSource = requestChanged
        ? requestedSources[0] ?? null
        : state.activeSource;
      const sourceSelectionByUser = requestChanged
        ? false
        : state.sourceSelectionByUser;

      if (!sourceSelectionByUser) {
        const activeSourcePreviouslyHadResults =
          !requestChanged &&
          activeSource !== null &&
          (state.snapshot?.outcomes[activeSource]?.results.length ?? 0) > 0;
        const firstSourceWithResults = requestedSources.find(
          (source) => sourceResults(source).length > 0,
        );
        const allOutcomesTerminal =
          requestedSources.length > 0 &&
          requestedSources.every((source) => {
            const status = snapshot.outcomes[source]?.status;
            return (
              status !== undefined &&
              !["idle", "checking-readiness", "searching"].includes(status)
            );
          });
        const noResults = requestedSources.every(
          (source) => sourceResults(source).length === 0,
        );

        if (activeSourcePreviouslyHadResults) {
          activeSource = state.activeSource;
        } else if (firstSourceWithResults) {
          activeSource = firstSourceWithResults;
        } else if (allOutcomesTerminal && noResults) {
          activeSource = requestedSources[0] ?? null;
        } else if (!activeSource) {
          activeSource = requestedSources[0] ?? null;
        }
      }

      return {
        ...state,
        snapshot,
        activeSource,
        sourceSelectionByUser,
        announcement: snapshot.active
          ? `${completed} of ${requestedSources.length} selected sources returned.`
          : "Federated search complete.",
      };
    }

    case "source-tab-selected":
      if (
        !state.snapshot?.request.requestedSources.includes(action.source)
      ) {
        return state;
      }
      return {
        ...state,
        activeSource: action.source,
        sourceSelectionByUser: true,
      };

    case "toggle-source": {
      const selectedSources = new Set(state.selectedSources);
      if (selectedSources.has(action.source)) selectedSources.delete(action.source); else selectedSources.add(action.source);
      const selectedResultIds = new Set([...state.selectedResultIds].filter((id) => {
        const result = state.snapshot ? Object.values(state.snapshot.outcomes).flatMap((value) => value.results).find((item) => item.resultId === id) : undefined;
        return !result || selectedSources.has(result.source);
      }));
      return { ...state, selectedSources, selectedResultIds, snapshot: null, activeSource: null, sourceSelectionByUser: false, announcement: `${action.source} ${selectedSources.has(action.source) ? "included" : "excluded"}. Run a new search.` };
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
