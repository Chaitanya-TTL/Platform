import { describe, expect, it } from "vitest";
import { discoveryReducer, initialDiscoveryState } from "../discovery/discovery-reducer";
import type {
  FederatedSearchSnapshot,
  LatticeSource,
  NormalizedSearchResult,
  SourceSearchOutcome,
  SourceSearchState,
} from "../discovery/contracts";

function makeResult(source: LatticeSource, resultId: string): NormalizedSearchResult {
  return {
    resultId,
    source,
    nativeId: resultId,
    displayName: resultId,
    entityType: "requirement",
    matchCategory: "source-native-reference",
    matchReason: "Source-native reference",
    capabilityHints: [],
    sourceMetadata: {},
    provenance: { providerMode: "live", retrievedAt: "", sourceRoute: "" },
    canStartInvestigation: true,
  };
}

function makeOutcome(
  source: LatticeSource,
  status: SourceSearchState,
  results: NormalizedSearchResult[] = [],
): SourceSearchOutcome {
  return {
    source,
    requestId: "request",
    status,
    results,
    startedAt: "",
    durationMs: 0,
    retryable: false,
    capabilitySnapshot: {},
  } as SourceSearchOutcome;
}

function makeSnapshot(
  requestId: string,
  requestedSources: LatticeSource[],
  outcomes: Partial<Record<LatticeSource, SourceSearchOutcome>>,
  active = true,
): FederatedSearchSnapshot {
  return {
    request: {
      requestId,
      query: "bracket",
      normalizedQuery: "bracket",
      queryIntent: "product-name",
      requestedSources,
      resultLimitPerSource: 20,
      startedAt: "",
      timeoutMs: 1000,
    },
    outcomes,
    active,
  } as FederatedSearchSnapshot;
}

describe("discovery source selection", () => {
  it("starts with Windchill and SAP selected", () => {
    expect(initialDiscoveryState.selectedSources).toEqual(new Set(["windchill", "sap"]));
  });

  it("does not announce search completion before a search starts", () => {
    expect(discoveryReducer(initialDiscoveryState, {
      type: "snapshot",
      value: null,
    }).announcement).toBe("Discovery ready.");
  });

  it("allows all sources to be toggled off without losing the query", () => {
    const withQuery = discoveryReducer(initialDiscoveryState, {
      type: "query",
      value: "steering assembly",
    });
    const withoutSap = discoveryReducer(withQuery, {
      type: "toggle-source",
      source: "sap",
    });
    const withoutSources = discoveryReducer(withoutSap, {
      type: "toggle-source",
      source: "windchill",
    });

    expect(withoutSources.query).toBe("steering assembly");
    expect(withoutSources.selectedSources.size).toBe(0);
  });

  it("starts on the first requested source and switches to the first result source", () => {
    const first = makeSnapshot("request-1", ["windchill", "sap"], {
      windchill: makeOutcome("windchill", "searching"),
      sap: makeOutcome("sap", "searching"),
    });
    const searching = discoveryReducer(initialDiscoveryState, {
      type: "snapshot",
      value: first,
    });
    expect(searching.activeSource).toBe("windchill");

    const sapResult = makeResult("sap", "material-1");
    const sapReturnsFirst = discoveryReducer(searching, {
      type: "snapshot",
      value: makeSnapshot("request-1", ["windchill", "sap", "codebeamer"], {
        windchill: makeOutcome("windchill", "empty"),
        sap: makeOutcome("sap", "succeeded", [sapResult]),
        codebeamer: makeOutcome("codebeamer", "searching"),
      }),
    });
    expect(sapReturnsFirst.activeSource).toBe("sap");

    const laterResults = discoveryReducer(sapReturnsFirst, {
      type: "snapshot",
      value: makeSnapshot("request-1", ["windchill", "sap", "codebeamer"], {
        windchill: makeOutcome("windchill", "empty"),
        sap: makeOutcome("sap", "succeeded", [sapResult]),
        codebeamer: makeOutcome("codebeamer", "succeeded", [
          makeResult("codebeamer", "requirement-1"),
        ]),
      }),
    });
    expect(laterResults.activeSource).toBe("sap");
  });

  it("keeps a manually selected tab through late responses and resets it for a new request", () => {
    const searching = discoveryReducer(initialDiscoveryState, {
      type: "snapshot",
      value: makeSnapshot("request-1", ["windchill", "sap"], {
        windchill: makeOutcome("windchill", "searching"),
        sap: makeOutcome("sap", "searching"),
      }),
    });
    const manuallySelected = discoveryReducer(searching, {
      type: "source-tab-selected",
      source: "sap",
    });
    expect(manuallySelected.sourceSelectionByUser).toBe(true);

    const lateResponse = discoveryReducer(manuallySelected, {
      type: "snapshot",
      value: makeSnapshot("request-1", ["windchill", "sap"], {
        windchill: makeOutcome("windchill", "succeeded", [
          makeResult("windchill", "part-1"),
        ]),
        sap: makeOutcome("sap", "searching"),
      }),
    });
    expect(lateResponse.activeSource).toBe("sap");
    expect(lateResponse.sourceSelectionByUser).toBe(true);

    const newRequest = discoveryReducer(lateResponse, {
      type: "snapshot",
      value: makeSnapshot("request-2", ["codebeamer", "sap"], {
        codebeamer: makeOutcome("codebeamer", "searching"),
        sap: makeOutcome("sap", "searching"),
      }),
    });
    expect(newRequest.activeSource).toBe("codebeamer");
    expect(newRequest.sourceSelectionByUser).toBe(false);
  });

  it("falls back to the first requested source when every outcome is terminal and empty", () => {
    const state = discoveryReducer(initialDiscoveryState, {
      type: "snapshot",
      value: makeSnapshot(
        "request-1",
        ["sap", "windchill"],
        {
          sap: makeOutcome("sap", "failed"),
          windchill: makeOutcome("windchill", "empty"),
        },
        false,
      ),
    });

    expect(state.activeSource).toBe("sap");
  });

  it("keeps individual selections when switching source tabs", () => {
    const windchill = makeResult("windchill", "part-1");
    const codebeamerOther = makeResult("codebeamer", "requirement-other");
    const snapshot = makeSnapshot("request-1", ["windchill", "codebeamer"], {
      windchill: makeOutcome("windchill", "succeeded", [windchill]),
      codebeamer: makeOutcome("codebeamer", "succeeded", [
        codebeamerOther,
      ]),
    }, false);
    const withSnapshot = discoveryReducer(initialDiscoveryState, {
      type: "snapshot",
      value: snapshot,
    });
    const withSelections = discoveryReducer(
      discoveryReducer(withSnapshot, { type: "select", result: windchill }),
      { type: "select", result: codebeamerOther },
    );

    const changedTab = discoveryReducer(withSelections, {
      type: "source-tab-selected",
      source: "codebeamer",
    });
    expect(changedTab.selectedResultIds).toEqual(
      new Set([windchill.resultId, codebeamerOther.resultId]),
    );
  });
});
