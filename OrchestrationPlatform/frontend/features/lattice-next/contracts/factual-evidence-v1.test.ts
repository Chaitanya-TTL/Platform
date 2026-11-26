import { describe, expect, it } from "vitest";
import {
  FACTUAL_EVIDENCE_CONTRACT_VERSION,
  validateApplicationParticipationV1,
  validateEngineeringFactEvidenceV1,
  validateGenericFactV1,
} from "./factual-evidence-v1";

const provenance = {
  source: "sap",
  provider: "sap-synthetic-fixture",
  nativeId: "MAT-42",
  nativeRevision: "R3",
  sourceExecutionId: "execution-8",
  artifactReference: "material-42",
  checksum: "sha256:source",
  observedAt: "2026-11-18T10:00:00Z",
  authority: "source-authoritative",
};

function fact(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: FACTUAL_EVIDENCE_CONTRACT_VERSION,
    factId: "fact-17",
    investigationId: "synthetic-investigation",
    snapshotRevision: 3,
    investigationRevision: 3,
    sourceApplication: "sap",
    sourceEntityId: "material-42",
    sourceNativeId: "MAT-42",
    canonicalEntityKind: "material",
    fieldId: "stock.quantity",
    sourceFieldName: "LABST",
    displayLabel: "Unrestricted stock",
    factRole: "metric",
    exactSourceValue: { amount: 12.5, currency: "USD" },
    sourceValueType: "money",
    valueType: "money",
    normalizedValue: { amount: 12.5, currency: "USD" },
    normalizedValueType: "money",
    unit: "USD",
    currency: "USD",
    precision: 2,
    dimensions: [
      { dimensionId: "plant", label: "Plant", exactValue: "plant-7", valueType: "identifier" },
    ],
    observedAt: "2026-11-18T10:00:00Z",
    freshness: "current",
    completeness: "complete",
    derivationStatus: "raw",
    transformationTrace: [],
    evidenceIds: ["evidence-17"],
    citationIds: ["citation-17"],
    citationEligible: true,
    sourceAuthority: "source-authoritative",
    provenance,
    authorizationDecisionId: "decision-9",
    ...overrides,
  };
}

describe("versioned factual evidence contracts", () => {
  it("preserves exact typed values and authorization-bound provenance", () => {
    const candidate = fact();
    expect(validateGenericFactV1(candidate).valid).toBe(true);
    const result = validateEngineeringFactEvidenceV1(candidate);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.fact.exactSourceValue).toEqual({ amount: 12.5, currency: "USD" });
      expect(result.fact.dimensions[0]).toMatchObject({
        dimensionId: "plant",
        exactValue: "plant-7",
      });
      expect(result.fact.authorizationDecisionId).toBe("decision-9");
      expect(result.fact.provenance).toEqual(provenance);
    }
  });

  it("rejects facts without an authorization decision binding", () => {
    const { authorizationDecisionId: _authorizationDecisionId, ...unbound } = fact();

    const result = validateEngineeringFactEvidenceV1(unbound);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.diagnostics.map(({ code }) => code)).toContain("missing-authorization-binding");
    }
  });

  it("rejects fact provenance that cannot identify a source record", () => {
    const result = validateGenericFactV1(fact({
      provenance: {
        entity: { source: "sap" },
        evidence: [],
        sourceFieldName: "LABST",
      },
    }));

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.diagnostics.map(({ code }) => code)).toContain("invalid-provenance");
    }
  });

  it("keeps cross-application participation separate from relationship claims", () => {
    const result = validateApplicationParticipationV1({
      contractVersion: FACTUAL_EVIDENCE_CONTRACT_VERSION,
      candidateId: "participation-1",
      investigationId: "synthetic-investigation",
      snapshotRevision: 3,
      sourceApplication: "windchill",
      canonicalEntityIds: ["part-17"],
      sourceOperation: "gather-intelligence",
      sourceOperationStatus: "partial",
      completeness: "partial",
      evidenceIds: ["evidence-17"],
      citationIds: ["citation-17"],
      citationEligible: true,
      sourceAuthority: "source-authoritative",
      provenance: { ...provenance, source: "windchill" },
      authorizationDecisionId: "decision-9",
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.participation.canonicalEntityIds).toEqual(["part-17"]);
      expect("relationshipIds" in result.participation).toBe(false);
    }
  });

  it("preserves source-operation lifecycle statuses", () => {
    for (const sourceStatus of ["requested", "running", "succeeded", "empty"]) {
      const result = validateApplicationParticipationV1({
        contractVersion: FACTUAL_EVIDENCE_CONTRACT_VERSION,
        candidateId: "participation-1",
        investigationId: "synthetic-investigation",
        snapshotRevision: 3,
        sourceApplication: "windchill",
        canonicalEntityIds: ["part-17"],
        sourceOperation: "gather-intelligence",
        sourceOperationStatus: sourceStatus,
        completeness: "partial",
        evidenceIds: ["evidence-17"],
        citationIds: ["citation-17"],
        citationEligible: true,
        sourceAuthority: "source-authoritative",
        provenance: { ...provenance, source: "windchill" },
        authorizationDecisionId: "decision-9",
      });

      expect(result.valid).toBe(true);
    }
  });
});
