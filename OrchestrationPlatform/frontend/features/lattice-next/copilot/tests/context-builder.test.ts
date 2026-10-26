import { describe, expect, it } from "vitest";
import type { InvestigationSnapshot } from "../../kernel/contracts/investigation-snapshot";
import type { EngineeringIntelligenceInvestigationV1, IntelligenceEntity, IntelligenceRelationship } from "../../contracts/intelligence-v1";
import { buildInvestigationContext, stableCitationId } from "../context-builder";

const temporal = { capturedAt: "2026-10-22T08:00:00.000Z", assembledAt: "2026-10-22T08:01:00.000Z", freshness: "current" as const };

function entity(id: string, source: "windchill" | "sap", nativeId: string, displayName: string, partNumber: string): IntelligenceEntity {
  return {
    id,
    kind: "part",
    displayName,
    identityQuality: "native",
    assertion: "fact",
    properties: { partNumber: { type: "text", text: partNumber } },
    provenance: { source, provider: `${source}-fixture`, nativeId, observedAt: temporal.capturedAt, authority: "source-authoritative" },
    temporal,
  };
}

const windchillPart = entity("entity:wc-1", "windchill", "OR:wt.part.WTPart:1001", "Steering Housing", "WC-1001");
const sapMaterial = entity("entity:sap-1", "sap", "000000000000004200", "Steering Housing Material", "MAT-4200");
const relation: IntelligenceRelationship = {
  id: "relationship:allocation-1",
  kind: "allocated-to",
  family: "part-material",
  sourceEntityId: windchillPart.id,
  targetEntityId: sapMaterial.id,
  assertion: "fact",
  confidence: "verified",
  evidenceIds: ["evidence:link-1"],
  properties: {},
  provenance: { source: "windchill", provider: "fixture", observedAt: temporal.capturedAt, authority: "source-authoritative" },
  temporal,
};

function canonical(entities: IntelligenceEntity[] = [], relationships: IntelligenceRelationship[] = []): EngineeringIntelligenceInvestigationV1 {
  return {
    contractVersion: "1.0",
    investigationId: "investigation-context-test",
    subject: {
      id: "subject:steering",
      displayName: "Steering Assembly",
      candidateIds: entities.map((item) => item.id),
      confidence: "verified",
      reasons: [],
      provenance: { provider: "fixture", observedAt: temporal.capturedAt, authority: "backend-derived" },
      temporal,
    },
    entities,
    relationships,
    evidence: entities.length ? [{ id: "evidence:link-1", kind: "source-record", summary: "Source confirms the link", source: "windchill", provenance: relation.provenance, temporal }] : [],
    findings: [],
    sources: entities.map((item) => ({ entityId: item.id, source: item.provenance.source!, status: "available", provenance: item.provenance })),
    identityClusters: [],
    temporal,
    summary: { entityCount: entities.length, relationshipCount: relationships.length, evidenceCount: entities.length ? 1 : 0, findingCount: 0, availableSourceCount: entities.length, partialSourceCount: 0, status: "success" },
  };
}

function snapshot(value?: EngineeringIntelligenceInvestigationV1, overrides: Partial<InvestigationSnapshot<EngineeringIntelligenceInvestigationV1>> = {}): InvestigationSnapshot<EngineeringIntelligenceInvestigationV1> {
  return {
    identity: { investigationId: "investigation-context-test" as InvestigationSnapshot["identity"]["investigationId"], revision: 7, executionEpoch: 2 },
    lifecycle: "ready",
    subjectLabel: "Steering Assembly",
    query: "Steering Assembly",
    selections: [
      { source: "windchill", nativeId: "OR:wt.part.WTPart:1001", displayName: "Steering Housing" },
      { source: "sap", nativeId: "000000000000004200", displayName: "Steering Housing Material" },
    ],
    executions: {},
    acceptedEvidenceIds: [],
    completeness: { overall: "complete", requestedSources: ["windchill", "sap"], successfulSources: ["windchill", "sap"], partialSources: [], failedSources: [], pendingSources: [], limitations: [] },
    canonical: value ? { revision: 7, publishedAt: temporal.assembledAt, value } : undefined,
    warnings: [],
    createdAt: temporal.capturedAt,
    updatedAt: temporal.assembledAt,
    ...overrides,
  };
}

describe("investigation copilot context", () => {
  it("resolves a direct native identifier to its entity and stable citation", () => {
    const packet = buildInvestigationContext(snapshot(canonical([windchillPart, sapMaterial])), "What is OR:wt.part.WTPart:1001?");
    const selected = packet.entities.find((item) => item.entityId === windchillPart.id);
    expect(selected).toMatchObject({ nativeId: "OR:wt.part.WTPart:1001", citationId: stableCitationId("entity", windchillPart.id) });
    expect(packet.grounding.unsupportedIdentifiers).toEqual([]);
  });

  it("includes relation endpoints and preserves their distinct source-native IDs", () => {
    const packet = buildInvestigationContext(snapshot(canonical([windchillPart, sapMaterial], [relation])), "Trace the allocation from Windchill to SAP");
    expect(packet.relationships).toContainEqual(expect.objectContaining({
      relationshipId: relation.id,
      sourceCitationId: stableCitationId("entity", windchillPart.id),
      targetCitationId: stableCitationId("entity", sapMaterial.id),
      sourceNativeId: "OR:wt.part.WTPart:1001",
      targetNativeId: "000000000000004200",
    }));
    expect(packet.citations.map((citation) => citation.nativeId)).toEqual(expect.arrayContaining([
      "OR:wt.part.WTPart:1001",
      "000000000000004200",
    ]));
  });

  it("surfaces no-evidence and unsupported-identifier uncertainty instead of inventing entities", () => {
    const packet = buildInvestigationContext(snapshot(canonical()), "Find item MAT-DOES-NOT-EXIST");
    expect(packet.grounding.hasCanonicalEvidence).toBe(false);
    expect(packet.grounding.unsupportedIdentifiers).toContain("MAT-DOES-NOT-EXIST");
    expect(packet.uncertainties).toEqual(expect.arrayContaining([expect.stringMatching(/no canonical evidence/i), expect.stringMatching(/not found/i)]));
  });

  it("marks partial and stale source states and reports conflicting values", () => {
    const conflictingSap = { ...sapMaterial, properties: { partNumber: { type: "text", text: "SAP-4200" } } };
    const value = canonical([windchillPart, conflictingSap]);
    const staleSnapshot = snapshot(value, {
      completeness: { overall: "partial", requestedSources: ["windchill", "sap"], successfulSources: ["windchill"], partialSources: [], failedSources: ["sap"], pendingSources: [], limitations: ["sap evidence unavailable"] },
      executions: {
        sap: {
          identity: { investigationId: "investigation-context-test" as InvestigationSnapshot["identity"]["investigationId"], revision: 7, executionEpoch: 2, executionId: "exec" as never, correlationId: "corr" as never, source: "sap", operation: "gather-intelligence", attempt: 1 },
          status: "failed",
          capturedAt: "2026-10-20T08:00:00.000Z",
          freshness: "stale",
          warnings: [],
        },
      },
    });
    const packet = buildInvestigationContext(staleSnapshot, "Compare the part numbers");
    expect(packet.grounding.partialSources).toContain("sap");
    expect(packet.grounding.staleSources).toContain("sap");
    const sapSelection = packet.sourceSelections.find((selection) => selection.source === "sap");
    expect(sapSelection).toMatchObject({ citationId: stableCitationId("source", "sap"), status: "failed", freshness: "stale" });
    expect(packet.citations).toContainEqual(expect.objectContaining({
      citationId: stableCitationId("source", "sap"),
      kind: "source",
      summary: expect.stringContaining("does not establish why this status occurred"),
    }));
    expect(packet.conflicts.length).toBeGreaterThan(0);
    expect(packet.uncertainties.join(" ")).toMatch(/partial|stale|conflict/i);
  });

  it("makes unresolved relationship evaluations citeable with their recorded evidence gap", () => {
    const evaluation = {
      ruleId: "CB_REQUIREMENT_SET_TO_CONFIGIT_MODEL" as const,
      relationshipType: "requirement-set-model-link",
      status: "unresolved" as const,
      sourceApplication: "codebeamer",
      sourceKinds: ["requirement-set"],
      targetApplication: "configit",
      targetKinds: ["model"],
      sourceCandidates: [],
      targetCandidates: [],
      compatibleSourceCandidates: [],
      compatibleTargetCandidates: [],
      sourceCandidateCount: 0,
      targetCandidateCount: 0,
      sourceCandidatesTruncated: false,
      targetCandidatesTruncated: false,
      observedSourceKinds: [],
      observedTargetKinds: [],
      evidenceIds: [],
      reasonCode: "linkage-evidence-not-found" as const,
      reason: "No approved linkage evidence was found.",
      technicalContext: {
        integrationName: "fixture",
        protocol: "fixture",
        direction: "codebeamer to configit",
        sourceObjectType: "requirement-set",
        targetObjectType: "model",
        documentation: [],
      },
      evaluatedAt: temporal.assembledAt,
    };
    const packet = buildInvestigationContext(snapshot({
      ...canonical(),
      universalRelationshipEvaluations: [evaluation],
    }), "Explain this unresolved relationship and its evidence gap");
    const citationId = stableCitationId("evaluation", `${evaluation.ruleId}:${evaluation.evaluatedAt}`);

    expect(packet.unresolvedEvaluations).toContainEqual(expect.objectContaining({ citationId, reasonCode: "linkage-evidence-not-found" }));
    expect(packet.citations).toContainEqual(expect.objectContaining({
      citationId,
      kind: "evaluation",
      summary: expect.stringContaining("No approved linkage evidence was found."),
    }));
  });

  it("is deterministic and discloses omissions when bounded", () => {
    const many = Array.from({ length: 80 }, (_, index) => entity(`entity:${index}`, "windchill", `native-${index}`, `Component ${index}`, `PN-${index}`));
    const value = canonical(many);
    const options = { maxContextChars: 7000, maxItemsPerCategory: 50 };
    const first = buildInvestigationContext(snapshot(value), "Find PN-79", options);
    const second = buildInvestigationContext(snapshot(value), "Find PN-79", options);
    expect(first).toEqual(second);
    expect(JSON.stringify(first).length).toBeLessThanOrEqual(options.maxContextChars);
    expect(first.omissions.categories).toContain("entities");
    expect(first.omissions.omittedCounts.entities).toBeGreaterThan(0);
  });
});
