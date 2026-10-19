import { describe, expect, it } from "vitest";
import { projectCodebeamerIntelligence } from "../engines/project-codebeamer-intelligence";
import { mergeSourceIntelligence } from "../infrastructure/merge-source-intelligence";

const payload = (id: number, customName: string) => ({
  intelligencePayload: {
    sourceExecutionId: `execution-${id}`,
    status: "success",
    evidence: {
      requirement: { canonicalId: `codebeamer:test:item:${id}`, itemId: id, externalKey: `REQ-${id}`, name: `Requirement ${id}`, status: "New", version: 1 },
      sourceContext: { projectId: 9, projectName: "Project", trackerId: 11, trackerName: "Requirements" },
      hierarchy: { parentName: null, childNames: [] },
      catalog: { revision: "revision", status: "complete", synchronizedAt: "2026-10-19T00:00:00Z" },
      liveEnrichment: {
        contractVersion: "2.0", status: "complete", retrievedAt: "2026-10-19T00:01:00Z",
        item: { status: "loaded", count: 1, retrievedAt: "2026-10-19T00:01:00Z", failures: [], data: { id, name: `Requirement ${id}`, typeName: "Requirement", customFields: [{ id: 81, name: customName, value: `Value ${id}` }] } },
        relations: { status: "loaded-empty", count: 0, retrievedAt: "2026-10-19T00:01:01Z", failures: [], data: {} },
        attachments: { status: "loaded-empty", count: 0, retrievedAt: "2026-10-19T00:01:02Z", failures: [], data: {} },
        failures: [],
      },
    },
    provenance: { provider: "codebeamer_extractor", observedAt: "2026-10-19T00:01:00Z" },
  },
});

describe("L-CB5C Codebeamer details projection", () => {
  it("preserves complete live evidence and loaded-empty semantics", () => {
    const result = projectCodebeamerIntelligence("investigation", payload(101, "Arbitrary Field"), "2026-10-19T00:02:00Z")!;
    const entity = result.entities.find((item) => item.id === "codebeamer:test:item:101")!;
    expect(entity.properties["codebeamer.evidence.contractVersion"].text).toBe("2.0");
    expect(entity.properties["codebeamer.evidence.item.status"].text).toBe("loaded");
    expect(entity.properties["codebeamer.evidence.relations.status"].text).toBe("loaded-empty");
    expect(entity.properties["codebeamer.evidence.attachments.count"].number).toBe(0);
    expect(entity.properties["codebeamer.custom.Arbitrary Field"].text).toContain("Value 101");
  });

  it("keeps evidence isolated for multiple requirements", () => {
    const first = projectCodebeamerIntelligence("first", payload(101, "Field A"), "2026-10-19T00:02:00Z")!;
    const second = projectCodebeamerIntelligence("second", payload(202, "Field B"), "2026-10-19T00:02:00Z")!;
    const merged = mergeSourceIntelligence([first, second]);
    const a = merged.entities.find((item) => item.id === "codebeamer:test:item:101")!;
    const b = merged.entities.find((item) => item.id === "codebeamer:test:item:202")!;
    expect(a.properties["codebeamer.custom.Field A"].text).toContain("101");
    expect(a.properties["codebeamer.custom.Field B"]).toBeUndefined();
    expect(b.properties["codebeamer.custom.Field B"].text).toContain("202");
  });
});
