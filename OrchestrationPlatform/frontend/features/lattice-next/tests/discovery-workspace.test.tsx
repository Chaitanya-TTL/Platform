import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DiscoverySourceResults,
  DiscoveryWorkspace,
} from "../discovery/DiscoveryWorkspace";
import type {
  FederatedSearchSnapshot,
  LatticeSource,
  NormalizedSearchResult,
  SourceSearchOutcome,
  SourceSearchState,
} from "../discovery/contracts";

function makeResult(
  source: LatticeSource,
  resultId: string,
  sourceMetadata: NormalizedSearchResult["sourceMetadata"] = {},
  overrides: Partial<NormalizedSearchResult> = {},
): NormalizedSearchResult {
  return {
    resultId,
    source,
    nativeId: "M-204",
    displayName: "Bracket assembly",
    entityType: "Material",
    revision: "C",
    matchCategory: "source-native-reference",
    matchReason: "Source-native reference match",
    capabilityHints: [],
    sourceMetadata,
    provenance: { providerMode: "live", retrievedAt: "", sourceRoute: "" },
    canStartInvestigation: true,
    ...overrides,
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
  requestedSources: LatticeSource[],
  outcomes: Partial<Record<LatticeSource, SourceSearchOutcome>>,
): FederatedSearchSnapshot {
  return {
    request: {
      requestId: "request",
      query: "bracket",
      normalizedQuery: "bracket",
      queryIntent: "product-name",
      requestedSources,
      resultLimitPerSource: 20,
      startedAt: "",
      timeoutMs: 1000,
    },
    outcomes,
    active: false,
  } as FederatedSearchSnapshot;
}

describe("discovery workspace", () => {
  it("leads with search and keeps the existing Windchill and SAP defaults", () => {
    const html = renderToStaticMarkup(createElement(DiscoveryWorkspace, {
      onInvestigate: vi.fn(),
    }));

    expect(html).toContain("<h1");
    expect(html).toContain("Find an engineering product");
    expect(html).toContain('id="lattice-discovery-query"');
    expect(html).toContain(">Search<svg");
    expect(html).toContain("Recent investigations");
    expect(html).not.toContain("Pick up where you left off");
    expect(html).toContain("url=%2Fimages%2Fwc_Logo.png");
    expect(html).toContain("url=%2Fimages%2Fsap_Logo.png");
    expect(html).toContain("url=%2Fimages%2Fconfigit_Logo.png");
    expect(html).toContain("url=%2Fimages%2Fcb.png");
    expect(html).toContain('alt="Windchill logo"');
    expect(html).toContain('alt="SAP logo"');
    expect(html).toContain('alt="Configit logo"');
    expect(html).toContain('alt="Codebeamer logo"');
    expect(html).toContain('aria-label="Windchill"');
    expect(html).toContain('aria-label="SAP"');
    expect(html).toContain("Teamcenter");
    expect(html).toContain(">TC</span>");
    expect(html).toMatch(/aria-label="Windchill"[^>]*checked=""/);
    expect(html).toMatch(/aria-label="SAP"[^>]*checked=""/);
    expect(html).toContain("Search in");
    expect(html).toContain("rounded-xl border border-slate-300");
    expect(html).toContain("Recent investigations");
    expect(html).not.toContain("truncate font-medium");
    expect(html).not.toContain("focus-within:shadow-[0_0_0_3px");
    expect(html).not.toContain("Searching Teamcenter");
    expect(html).not.toContain("Engineering discovery");
  });

  it("renders the full history state separately from the fresh search", () => {
    const html = renderToStaticMarkup(createElement(DiscoveryWorkspace, {
      mode: "history",
      onInvestigate: vi.fn(),
    }));

    expect(html).toContain("Investigation history");
    expect(html).toContain('href="/lattice"');
    expect(html).not.toContain('id="lattice-discovery-query"');
  });

  it("renders requested-source tabs and only the active source panel", () => {
    const snapshot = makeSnapshot(["windchill", "sap"], {
      windchill: makeOutcome("windchill", "succeeded", [
        makeResult("windchill", "part-204"),
      ]),
      sap: makeOutcome("sap", "succeeded", [
        makeResult("sap", "material-204", {
          plant: "Toronto",
          catalogRevision: "2026-04",
        }),
      ]),
      teamcenter: makeOutcome("teamcenter", "succeeded", [
        makeResult("teamcenter", "teamcenter-record"),
      ]),
    });
    const html = renderToStaticMarkup(
      createElement(DiscoverySourceResults, {
        snapshot,
        activeSource: "sap",
        selectedResultIds: new Set<string>(),
        expandedSources: new Set<LatticeSource>(),
        onSourceSelect: vi.fn(),
        onSelectResult: vi.fn(),
        onRetry: vi.fn(),
        onToggleExpanded: vi.fn(),
      }),
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-controls="lattice-source-panel-sap"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('id="lattice-source-panel-sap"');
    expect(html).toContain(">Windchill<");
    expect(html).toContain(">SAP<");
    expect(html).toContain("1 match");
    expect(html).not.toContain(">Teamcenter<");
    expect(html).toContain("M-204");
    expect(html).not.toContain("part-204");
    expect(html).not.toContain("teamcenter-record");
    expect(html).toContain("Material · M-204 · Revision C");
    expect(html).toContain("<span class=\"font-medium\">Plant:</span> Toronto");
    expect(html).toContain("Source details");
    expect(html).toContain("<span class=\"font-medium\">Catalog Revision:</span> 2026-04");
    expect(html).toContain("Why this match");
    expect(html).toMatch(/<details[^>]*>[\s\S]*Source-native reference match[\s\S]*<\/details>/);
  });

  it("omits an empty identity line and only renders supplied source context", () => {
    const sparse = makeResult("windchill", "part-sparse", {}, {
      entityType: "",
      nativeId: "",
      revision: undefined,
    });
    const snapshot = makeSnapshot(["windchill"], {
      windchill: makeOutcome("windchill", "succeeded", [sparse]),
    });
    const html = renderToStaticMarkup(
      createElement(DiscoverySourceResults, {
        snapshot,
        activeSource: "windchill",
        selectedResultIds: new Set<string>(),
        expandedSources: new Set<LatticeSource>(),
        onSourceSelect: vi.fn(),
        onSelectResult: vi.fn(),
        onRetry: vi.fn(),
        onToggleExpanded: vi.fn(),
      }),
    );

    expect(html).not.toContain("Material ·");
    expect(html).not.toContain("Part number:");
    expect(html).not.toContain("Lifecycle:");
    expect(html).not.toContain("<span class=\"mt-1 block");
  });

  it("keeps successful source results concise and makes loading more results prominent", () => {
    const codebeamerResults = Array.from({ length: 10 }, (_, index) =>
      makeResult("codebeamer", `requirement-${index + 1}`, {}, {
        displayName: `Steering requirement ${index + 1}`,
        entityType: "Requirement",
      }),
    );
    const html = renderToStaticMarkup(
      createElement(DiscoverySourceResults, {
        snapshot: makeSnapshot(["codebeamer"], {
          codebeamer: makeOutcome("codebeamer", "succeeded", codebeamerResults),
        }),
        activeSource: "codebeamer",
        selectedResultIds: new Set<string>(),
        expandedSources: new Set<LatticeSource>(),
        onSourceSelect: vi.fn(),
        onSelectResult: vi.fn(),
        onRetry: vi.fn(),
        onToggleExpanded: vi.fn(),
      }),
    );

    expect(html).toContain("Load 7 more results");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Choose the record that belongs in this investigation.");
    expect(html).not.toContain("Codebeamer requirements");
    expect(html).not.toContain("candidates ·");
    expect(html).not.toContain("Select direct matches");
    expect(html).not.toContain("Select all Codebeamer");
  });
});
