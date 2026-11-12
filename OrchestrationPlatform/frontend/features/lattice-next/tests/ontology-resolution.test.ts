import { describe, expect, it } from "vitest";
import { buildSprint1A5GoldenInvestigation } from "./sprint-1a5-fixture-support";

describe("Sprint 1A.5 governed ontology evidence", () => {
  it("resolves all three validated Windchill cross-system relationships", () => {
    const graph = buildSprint1A5GoldenInvestigation().knowledgeGraph;
    expect(graph?.resolvedRelationships).toHaveLength(3);
    expect(graph?.resolvedRelationships.map((relationship) => relationship.forwardType).sort()).toEqual([
      "configured-by",
      "operationally-represented-as",
      "specified-by",
    ]);
  });

  it("retains reversible handshake provenance on adapted evidence", () => {
    const relationships = buildSprint1A5GoldenInvestigation().knowledgeGraph?.resolvedRelationships ?? [];
    const sapMaterial = relationships.find((relationship) => relationship.forwardType === "operationally-represented-as");
    expect(sapMaterial?.evidence).toHaveLength(2);
    expect(sapMaterial?.evidence.every((item) =>
      item.mappingId === "MAP-WC-SAP-001" &&
      item.mappingReference === "PLM-RELATIONSHIP-BIBLE-V1" &&
      item.mappingBasis === "domain-owner-confirmed" &&
      Boolean(item.handshakeEvidenceId && item.ontologyRuleId && item.ontologyFieldPath),
    )).toBe(true);
    expect(sapMaterial?.evidence.map((item) => item.path).sort()).toEqual([
      "properties.preferredProductId",
      "provenance.nativeId",
    ]);
  });
});
