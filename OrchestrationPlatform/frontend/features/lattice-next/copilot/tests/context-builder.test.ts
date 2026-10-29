import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { InvestigationSnapshot } from "../../kernel/contracts/investigation-snapshot";
import type { EngineeringIntelligenceInvestigationV1, IntelligenceEntity, IntelligenceRelationship } from "../../contracts/intelligence-v1";
import { buildInvestigationContext, stableCitationId } from "../context-builder";

const temporal = { capturedAt: "2026-10-22T08:00:00.000Z", assembledAt: "2026-10-22T08:01:00.000Z", freshness: "current" as const };
const relationshipDocument = readFileSync(resolve(process.cwd(), "..", "docs", "relationships.md"), "utf8");

function entity(id: string, source: "windchill" | "sap" | "teamcenter" | "codebeamer" | "configit", nativeId: string, displayName: string, partNumber: string): IntelligenceEntity {
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

function link(id: string, sourceEntityId: string, targetEntityId: string): IntelligenceRelationship {
  return { ...relation, id, sourceEntityId, targetEntityId };
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

  it("includes relationship guidance for the selected path", () => {
    const packet = buildInvestigationContext(
      snapshot(canonical([windchillPart, sapMaterial], [relation])),
      "Trace the allocation from Windchill to SAP",
      { relationshipDocument },
    );

    expect(packet.relationshipGuidance).toContainEqual(expect.objectContaining({
      sourceApplication: "Windchill",
      targetApplication: "SAP",
    }));
    const guidance = packet.relationshipGuidance.find((section) => section.sourceApplication === "Windchill" && section.targetApplication === "SAP")!;
    expect(guidance.content).toContain("MAY_IMPACT");
    expect(guidance.content).toMatch(/must never be claimed to have caused/i);
    expect(packet.relationships).toContainEqual(expect.objectContaining({
      relationshipId: relation.id,
      semanticGuidanceAvailable: true,
    }));
  });

  it("includes incoming relationships when the focal entity is the target", () => {
    const packet = buildInvestigationContext(
      snapshot(canonical([windchillPart, sapMaterial], [relation])),
      "Trace SAP material 000000000000004200",
      { relationshipDocument },
    );

    expect(packet.relationships).toContainEqual(expect.objectContaining({
      relationshipId: relation.id,
      sourceEntityId: windchillPart.id,
      targetEntityId: sapMaterial.id,
    }));
  });

  it("preserves path endpoints and evidence when context is trimmed", () => {
    const packet = buildInvestigationContext(
      snapshot(canonical([windchillPart, sapMaterial], [relation])),
      "Trace the allocation from Windchill to SAP",
      { relationshipDocument, maxContextChars: 2_048, maxItemsPerCategory: 2 },
    );

    const retained = packet.relationships.find((item) => item.relationshipId === relation.id);
    if (retained) {
      expect(retained.evidenceCitationIds).toContain(stableCitationId("evidence", "evidence:link-1"));
      for (const selectedRelationship of packet.relationships) {
        expect(packet.entities.some((item) => item.entityId === selectedRelationship.sourceEntityId)).toBe(true);
        expect(packet.entities.some((item) => item.entityId === selectedRelationship.targetEntityId)).toBe(true);
        for (const citationId of selectedRelationship.evidenceCitationIds) {
          expect(packet.evidence.some((item) => item.citationId === citationId)).toBe(true);
        }
      }
    } else {
      expect(packet.omissions.omittedCounts.relationships).toBeGreaterThan(0);
      expect(packet.uncertainties.join(" ")).toMatch(/omitted \d+ relationship path/i);
    }
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(2_048);
  });

  it("does not create a relationship from a name-only match", () => {
    const similarlyNamed = entity("entity:wc-2", "windchill", "OR:wt.part.WTPart:1002", "Steering Housing", "WC-1002");
    const packet = buildInvestigationContext(
      snapshot(canonical([windchillPart, similarlyNamed])),
      "Are these Steering Housing records connected?",
      { relationshipDocument },
    );

    expect(packet.relationships).toEqual([]);
  });

  it("does not assert impact for provisional identity candidates", () => {
    const provisionalPart = { ...windchillPart, identityQuality: "provisional" as const };
    const packet = buildInvestigationContext(
      snapshot(canonical([provisionalPart, sapMaterial], [link("provisional:impact", provisionalPart.id, sapMaterial.id)])),
      "Trace OR:wt.part.WTPart:1001 into SAP",
      { relationshipDocument },
    );
    const provisionalPath = packet.relationships.find((item) => item.relationshipId === "provisional:impact");

    expect(provisionalPath).toMatchObject({ identitySupported: false });
    expect(packet.uncertainties.join(" ")).toMatch(/provisional identity/i);
  });

  it("flags an observed Teamcenter pair without documented semantics", () => {
    const teamcenterPart = entity("entity:tc-1", "teamcenter", "TC-1001", "Steering Housing", "TC-1001");
    const packet = buildInvestigationContext(
      snapshot(canonical([teamcenterPart, sapMaterial], [link("runtime:teamcenter-link", teamcenterPart.id, sapMaterial.id)])),
      "Trace Teamcenter record TC-1001 to SAP",
      { relationshipDocument },
    );

    expect(packet.relationships).toContainEqual(expect.objectContaining({
      relationshipId: "runtime:teamcenter-link",
      semanticGuidanceAvailable: false,
    }));
    expect(packet.relationshipGuidance.some((section) => section.sourceApplication === "Teamcenter")).toBe(false);
    expect(packet.uncertainties.join(" ")).toMatch(/cannot be interpreted.*authoritative/i);
  });

  it("marks the Codebeamer-to-Configit runtime rule as documented", () => {
    const requirementSet = entity("entity:cb-1", "codebeamer", "CB-1190", "Requirement Set", "CB-1190");
    const configitModel = entity("entity:configit-1", "configit", "CFG-305", "Configuration Model", "CFG-305");
    const packet = buildInvestigationContext(
      snapshot(canonical([requirementSet, configitModel], [link("runtime:cb-configit", requirementSet.id, configitModel.id)])),
      "Trace Codebeamer requirement CB-1190 to Configit",
      { relationshipDocument },
    );

    expect(packet.relationships).toContainEqual(expect.objectContaining({
      relationshipId: "runtime:cb-configit",
      semanticGuidanceAvailable: true,
    }));
    expect(packet.relationshipGuidance).toContainEqual(expect.objectContaining({
      sourceApplication: "Codebeamer",
      targetApplication: "Configit",
    }));
  });

  it("preserves partial and stale source uncertainty with relationship guidance", () => {
    const value = canonical([windchillPart, sapMaterial], [relation]);
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
    const packet = buildInvestigationContext(staleSnapshot, "Trace OR:wt.part.WTPart:1001 to SAP", { relationshipDocument });

    expect(packet.relationshipGuidance).toContainEqual(expect.objectContaining({
      sourceApplication: "Windchill",
      targetApplication: "SAP",
    }));
    expect(packet.uncertainties.join(" ")).toMatch(/partial|stale/i);
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

  it("does not leave unresolved-evaluation evidence citations dangling after trimming", () => {
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
      evidenceIds: ["evidence:zzz"],
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
    const value = {
      ...canonical(),
      evidence: [
        { id: "evidence:aaa", kind: "source-record", summary: "Unrelated source record", source: "windchill", provenance: relation.provenance, temporal },
        { id: "evidence:zzz", kind: "source-record", summary: "Archived ledger entry", source: "codebeamer", provenance: relation.provenance, temporal },
      ],
      universalRelationshipEvaluations: [evaluation],
    };
    const packet = buildInvestigationContext(
      snapshot(value),
      "Why is this unresolved?",
      { maxItemsPerCategory: 1 },
    );
    const retainedEvidenceCitationIds = new Set(packet.evidence.map((item) => item.citationId));

    expect(packet.unresolvedEvaluations).toHaveLength(1);
    expect(packet.unresolvedEvaluations[0].evidenceCitationIds.every((id) => retainedEvidenceCitationIds.has(id))).toBe(true);
  });

  it("keeps oversized relationship omission metadata within the context limit", () => {
    const manyRelationships = Array.from({ length: 30 }, (_, index) => link(
      `relationship-${String(index).padStart(2, "0")}-${"x".repeat(90)}`,
      windchillPart.id,
      sapMaterial.id,
    ));
    const packet = buildInvestigationContext(
      snapshot(canonical([windchillPart, sapMaterial], manyRelationships)),
      "Trace OR:wt.part.WTPart:1001",
      { maxContextChars: 2_048, maxItemsPerCategory: 1 },
    );

    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(2_048);
    expect(packet.omissions.omittedCounts.relationships).toBeGreaterThan(0);
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
