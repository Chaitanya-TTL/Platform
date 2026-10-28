import { describe, expect, it } from "vitest";
import type { NormalizedSearchResult } from "../discovery/contracts";
import {
  presentAdditionalSourceContext,
  presentRecordIdentity,
  presentSourceContext,
} from "../discovery/discovery-presentation";

function makeResult(overrides: Partial<NormalizedSearchResult> = {}): NormalizedSearchResult {
  return {
    resultId: "result-1",
    source: "windchill",
    nativeId: "WT-100",
    displayName: "Bracket",
    entityType: "Part",
    matchCategory: "source-native-reference",
    matchReason: "Source record",
    capabilityHints: [],
    sourceMetadata: {},
    provenance: {
      providerMode: "live",
      retrievedAt: "2026-10-28T00:00:00.000Z",
      sourceRoute: "/api/item-explorer/search/windchill",
    },
    canStartInvestigation: true,
    ...overrides,
  };
}

describe("discovery presentation", () => {
  describe("presentRecordIdentity", () => {
    it("includes the Windchill object type, native ID, and revision", () => {
      expect(presentRecordIdentity(makeResult({ revision: "C" }))).toBe("Part · WT-100 · Revision C");
    });

    it("identifies SAP materials by their native material ID and version", () => {
      expect(presentRecordIdentity(makeResult({
        source: "sap",
        entityType: "Material",
        nativeId: "MAT-42",
        version: "2026.1",
      }))).toBe("Material · MAT-42 · Version 2026.1");
    });

    it("distinguishes Configit work items and packages", () => {
      expect(presentRecordIdentity(makeResult({
        source: "configit",
        entityType: "Work item",
        nativeId: "WI-18",
      }))).toBe("Work item · WI-18");
      expect(presentRecordIdentity(makeResult({
        source: "configit",
        entityType: "Package",
        nativeId: "PKG-18",
        revision: "R2",
        version: "8.4",
      }))).toBe("Package · PKG-18 · Revision R2 · Version 8.4");
    });

    it("identifies Codebeamer requirements and omits absent optional revisions", () => {
      expect(presentRecordIdentity(makeResult({
        source: "codebeamer",
        entityType: "Requirement",
        nativeId: "REQ-7",
      }))).toBe("Requirement · REQ-7");
    });

    it("does not present a generic fallback type as source-native identity", () => {
      expect(presentRecordIdentity(makeResult({
        source: "sap",
        entityType: "engineering-record",
        nativeId: "MAT-42",
      }))).toBe("MAT-42");
    });
  });

  describe("presentSourceContext", () => {
    it("presents useful Windchill part context", () => {
      expect(presentSourceContext(makeResult({
        sourceMetadata: { partNumber: "PN-100", plant: "Plant 4", organization: "Engineering" },
        lifecycleState: "Released",
      }))).toEqual([
        { label: "Part number", value: "PN-100" },
        { label: "Lifecycle", value: "Released" },
        { label: "Plant", value: "Plant 4" },
      ]);
    });

    it("presents SAP material catalog context", () => {
      expect(presentSourceContext(makeResult({
        source: "sap",
        sourceMetadata: { plant: "DE01", organization: "MRO", catalogRevision: "2026-04", catalogStatus: "Current", stale: false },
      }))).toEqual([
        { label: "Plant", value: "DE01" },
        { label: "Catalog status", value: "Current" },
        { label: "Freshness", value: "Current" },
      ]);
    });

    it("presents Configit configuration and package context without duplicate labels", () => {
      const context = presentSourceContext(makeResult({
        source: "configit",
        sourceMetadata: {
          productModelCode: "Model-A",
          resolvedPackagePath: "/models/a",
          logicalPackagePath: "models/a",
          packageState: "Published",
        },
        lifecycleState: "Released",
      }));

      expect(context).toEqual([
        { label: "Model code", value: "Model-A" },
        { label: "Package path", value: "/models/a" },
        { label: "Package state", value: "Published" },
      ]);
      expect(new Set(context.map(({ label }) => label)).size).toBe(context.length);
    });

    it("presents Codebeamer external key, tracker, project, and classification once", () => {
      const context = presentSourceContext(makeResult({
        source: "codebeamer",
        sourceMetadata: {
          externalKey: "REQ-EXT-7",
          trackerName: "Safety",
          trackerId: "tracker-1",
          projectName: "Flight Controls",
          projectId: "project-1",
          classification: "direct",
        },
      }));

      expect(context).toEqual([
        { label: "External key", value: "REQ-EXT-7" },
        { label: "Tracker", value: "Safety" },
        { label: "Project", value: "Flight Controls" },
      ]);
      expect(new Set(context.map(({ label }) => label)).size).toBe(context.length);
    });

    it("omits empty, null, and undefined values instead of inventing context", () => {
      const sourceMetadata = {
        partNumber: "",
        plant: undefined,
        organization: null,
      } as unknown as NormalizedSearchResult["sourceMetadata"];

      expect(presentSourceContext(makeResult({
        sourceMetadata,
        lifecycleState: undefined,
      }))).toEqual([]);
    });
  });

  it("keeps non-primary source metadata available for an explicit details disclosure", () => {
    expect(presentAdditionalSourceContext(makeResult({
      source: "configit",
      version: "8.4",
      sourceMetadata: {
        objectType: "configit-package",
        version: "8.4",
        productModelCode: "MOD-4",
        packageState: "Published",
        publishedAt: "2026-10-28",
        published: true,
      },
    }))).toEqual([
      { label: "Published At", value: "2026-10-28" },
      { label: "Published", value: "true" },
    ]);
  });
});
