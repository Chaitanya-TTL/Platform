import { describe, expect, it } from "vitest";
import type { EngineeringIntelligenceInvestigationV1 } from "../../contracts/intelligence-v1";
import { asCorrelationId, asExecutionId, asInvestigationId } from "../contracts/investigation-identity";
import type { EvidenceEnvelope } from "../contracts/evidence-envelope";
import type { InvestigationSnapshot } from "../contracts/investigation-snapshot";
import { CurrentCanonicalAssemblyAdapter } from "./current-canonical-assembly-adapter";

const temporal = {
  assembledAt: "2026-11-26T00:00:00.000Z",
  freshness: "current" as const,
};

function sourceIntelligence(source: "configit" | "sap"): EngineeringIntelligenceInvestigationV1 {
  return {
    contractVersion: "1.0",
    investigationId: `source-investigation-${source}`,
    subject: {
      id: `subject-${source}`,
      displayName: `${source} subject`,
      candidateIds: [],
      confidence: "verified",
      reasons: [],
      provenance: {
        source,
        provider: `${source}-connector`,
        observedAt: temporal.assembledAt,
        authority: "source-authoritative",
      },
      temporal,
    },
    entities: [],
    relationships: [],
    evidence: [],
    findings: [],
    sources: [],
    identityClusters: [],
    temporal,
    summary: {
      entityCount: 0,
      relationshipCount: 0,
      evidenceCount: 0,
      findingCount: 0,
      availableSourceCount: 0,
      partialSourceCount: 0,
      status: "success",
    },
  };
}

function acceptedEvidence(
  investigationId: string,
  source: "configit" | "sap",
  payload: EngineeringIntelligenceInvestigationV1,
): EvidenceEnvelope<EngineeringIntelligenceInvestigationV1> {
  return {
    envelopeVersion: "1.0",
    identity: {
      investigationId: asInvestigationId(investigationId),
      revision: 1,
      executionEpoch: 0,
      executionId: asExecutionId(`execution-${source}`),
      correlationId: asCorrelationId(`correlation-${source}`),
      source,
      operation: "gather-intelligence",
      attempt: 1,
    },
    authority: "source-authoritative",
    observedAt: temporal.assembledAt,
    freshness: "current",
    validation: { status: "accepted", schemaVersion: "1.0", issues: [] },
    warnings: [],
    payload,
  };
}

describe("CurrentCanonicalAssemblyAdapter", () => {
  it("keeps the published canonical investigation ID bound to its snapshot when merging sources", async () => {
    const investigationId = asInvestigationId("lattice-investigation-1");
    const snapshot = {
      identity: { investigationId, revision: 1, executionEpoch: 0 },
    } as InvestigationSnapshot;
    const adapter = new CurrentCanonicalAssemblyAdapter();

    const singleSourceCanonical = await adapter.assemble(snapshot, [
      acceptedEvidence(String(investigationId), "configit", sourceIntelligence("configit")),
    ]);
    const canonical = await adapter.assemble(snapshot, [
      acceptedEvidence(String(investigationId), "configit", sourceIntelligence("configit")),
      acceptedEvidence(String(investigationId), "sap", sourceIntelligence("sap")),
    ]);

    expect(singleSourceCanonical.investigationId).toBe(investigationId);
    expect(canonical.investigationId).toBe(investigationId);
  });

  it("adds source-field lineage to raw properties without changing their exact values", async () => {
    const investigationId = asInvestigationId("lattice-investigation-1");
    const snapshot = {
      identity: { investigationId, revision: 1, executionEpoch: 0 },
    } as InvestigationSnapshot;
    const payload = sourceIntelligence("configit");
    const entityId = "configit-rule-17";
    const exactExpression = "if STYPE.LCSTYPE then not ORIENTATION.[05]";
    payload.entities = [{
      id: entityId,
      kind: "configuration-rule",
      displayName: "Steering rule",
      identityQuality: "native",
      assertion: "fact",
      properties: {
        expression: { type: "text", text: exactExpression },
      },
      provenance: {
        source: "configit",
        provider: "configit-connector",
        nativeId: "RULE-17",
        nativeRevision: "R2",
        artifactReference: entityId,
        observedAt: temporal.assembledAt,
        authority: "source-authoritative",
      },
      temporal,
    }];

    const canonical = await new CurrentCanonicalAssemblyAdapter().assemble(snapshot, [
      acceptedEvidence(String(investigationId), "configit", payload),
    ]);

    expect(canonical.entities[0].properties.expression).toEqual({
      type: "text",
      text: exactExpression,
    });
    expect(canonical.entities[0].sourceFieldMetadata?.expression).toEqual([
      expect.objectContaining({
        sourceValue: exactExpression,
        sourceFieldName: "expression",
        sourceAuthority: "source-authoritative",
        citationIds: [expect.stringMatching(/^source-evidence:/)],
      }),
    ]);
  });
});
