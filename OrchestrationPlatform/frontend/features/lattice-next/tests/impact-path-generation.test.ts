import { describe, expect, it } from "vitest";
import { enrichInvestigationWithOntology } from "../plm-brain/universal/ontology-evaluator";
import { buildSprint1A5GoldenInvestigation, ontology } from "./sprint-1a5-fixture-support";

describe("Sprint 1A.5 impact path generation", () => {
  it("generates impact paths and chains from ontology-resolved fixture relationships", () => {
    const graph = buildSprint1A5GoldenInvestigation().knowledgeGraph;
    expect(graph?.resolvedRelationships.length).toBeGreaterThan(0);
    expect(graph?.impactPaths.length).toBeGreaterThan(0);
    expect(graph?.impactChains?.length).toBeGreaterThan(0);
    expect(graph?.impactPaths.every((path) => path.impactEligible)).toBe(true);
    expect(graph?.impactChains?.every((chain) => chain.supportingEvidenceIds.length > 0)).toBe(true);
  });

  it("does not promote unmatched canonical fallback relationships to impact paths", () => {
    const canonical = buildSprint1A5GoldenInvestigation();
    const fallbackRelationship = {
      ...canonical.relationships[0],
      id: "fixture:unmatched-sap-configit",
      kind: "unverified-association",
      sourceEntityId: "sap:material",
      targetEntityId: "configit:model",
      evidenceIds: [],
    };
    const graph = enrichInvestigationWithOntology({
      ...canonical,
      relationships: [...canonical.relationships, fallbackRelationship],
    }, ontology, 2).knowledgeGraph;
    const fallbackPaths = graph?.relationshipPaths.filter((path) =>
      path.relationshipIds.includes(fallbackRelationship.id),
    ) ?? [];
    expect(fallbackPaths.length).toBeGreaterThan(0);
    expect(fallbackPaths.every((path) => !path.impactEligible)).toBe(true);
    expect(graph?.impactPaths.some((path) => fallbackPaths.includes(path))).toBe(false);
  });
});
