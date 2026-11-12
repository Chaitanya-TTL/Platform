import { describe, expect, it, vi } from "vitest";
import { buildInvestigationContext, engineeringPromptPayload } from "../../context-builder";
import { COPILOT_EVALUATION_CASES } from "../../evals/cases";
import * as retrieval from "../retrieve-evidence";
import { buildRetrievalQuery } from "../build-retrieval-query";
import type { RetrievalIntent, RetrievalPrincipalScope } from "../contracts";
import { enrichInvestigationWithOntology } from "../../../plm-brain/universal/ontology-evaluator";
import {
  buildSprint1A5GoldenInvestigation,
  buildSprint1A5Snapshot,
  ontology,
  relationshipsDocument,
} from "../../../tests/sprint-1a5-fixture-support";

const principal: RetrievalPrincipalScope = {
  tenantId: "test-tenant",
  principalId: "fixture-user",
  groupIds: [],
  applicationEntitlements: ["windchill", "sap", "configit", "codebeamer"],
  policyVersion: "fixture-policy-v1",
  origin: "test-fixture",
};

const m1 = COPILOT_EVALUATION_CASES.find((item) => item.roadmapIds.includes("M1"))!;
const e1 = COPILOT_EVALUATION_CASES.find((item) => item.roadmapIds.includes("E1"))!;
const m2Question = "What operational consequence follows from this Windchill part being represented as a SAP material?";
const requiredPacketKeys = [
  "schemaVersion", "investigationId", "snapshotRevision", "lifecycle", "subject", "userMessage", "questionIntent",
  "entityCandidates", "selectedEntityIds", "entityConfidence", "retrievalConfidence", "ambiguity", "sourceSelections",
  "grounding", "relationshipPaths", "impactPaths", "relationshipDefinitions", "impactSummary", "reasoningPackage",
  "engineeringBrief", "relationshipFlow", "subjectTraceabilityDiagnostics", "entities", "relationships",
  "relationshipGuidance", "findings", "unresolvedEvaluations", "evidence", "evidenceGroups", "conflicts",
  "citations", "uncertainties", "omissions",
].sort();
const optionalPacketKeys = new Set(["consequenceEvidenceState", "knowledgeGraph", "knowledgeGraphSummary", "ontologyVersion"]);
const m1Canonical = m1.snapshot.canonical?.value;
if (!m1Canonical) throw new Error("The frozen M1 fixture must include a canonical investigation.");
const m1Snapshot = {
  ...m1.snapshot,
  canonical: {
    ...m1.snapshot.canonical!,
    value: enrichInvestigationWithOntology(m1Canonical, ontology, m1.snapshot.identity.revision),
  },
};

describe("frozen M1/M2/E1 retrieval isolation", () => {
  it("keeps context and projected provider-payload shapes unchanged and never invokes retrieval", () => {
    const retrievalSpy = vi.spyOn(retrieval, "retrieveEvidence");
    const m2Snapshot = buildSprint1A5Snapshot(buildSprint1A5GoldenInvestigation());
    const cases = [
      { id: "M1", snapshot: m1Snapshot, question: m1.question },
      { id: "M2", snapshot: m2Snapshot, question: m2Question },
      { id: "E1", snapshot: e1.snapshot, question: e1.question },
    ] as const;
    const shapes = new Map<string, { packet: ReturnType<typeof buildInvestigationContext>; payload: ReturnType<typeof engineeringPromptPayload> }>();

    for (const testCase of cases) {
      const options = testCase.id === "M2" ? { relationshipDocument: relationshipsDocument } : undefined;
      const packet = buildInvestigationContext(testCase.snapshot, testCase.question, options);
      const payload = engineeringPromptPayload(testCase.question, packet);
      shapes.set(testCase.id, { packet, payload });

      const packetKeys = Object.keys(packet).sort();
      expect(packetKeys).toEqual(expect.arrayContaining(requiredPacketKeys));
      expect(packetKeys.filter((key) => !requiredPacketKeys.includes(key)).every((key) => optionalPacketKeys.has(key))).toBe(true);
      expect(buildRetrievalQuery({
        originalQuestion: testCase.question,
        intent: packet.questionIntent as RetrievalIntent,
        investigationId: String(packet.investigationId),
        canonicalSubjectIds: [],
        selectedEntityIds: packet.selectedEntityIds,
        relationshipEndpointEntityIds: packet.relationships.flatMap((item) => [item.sourceEntityId, item.targetEntityId]),
        sourceApplicationFilters: [],
        documentTypeFilters: [],
      }, principal), testCase.id).toBeUndefined();
      expect(Object.keys(packet)).not.toContain("retrievalEvidence");
      expect(Object.keys(packet)).not.toContain("retrievalDiagnostics");
      expect(JSON.stringify(payload)).not.toContain("cite:retrieval-document:v1:");
    }

    const m1Context = shapes.get("M1")!;
    expect(m1Context.packet.questionIntent).toBe("relationship");
    expect(m1Context.packet.engineeringBrief.subjectApplicationParticipation.map((item) => item.application))
      .toEqual(expect.arrayContaining(["Codebeamer", "Windchill", "SAP", "Configit"]));
    expect(Object.keys(m1Context.payload).sort()).toEqual([
      "engineeringBrief",
      "engineeringInsights",
      "investigationSummary",
      "missingEvidence",
      "question",
      "recommendedInvestigationAreas",
      "strongestEvidence",
      "supportingContext",
      "topFindings",
      "topImpactChains",
      "unresolvedRelationships",
    ]);
    expect(m1Context.payload.supportingContext.citations.map((item) => item.citationId))
      .toEqual(m1Context.packet.citations.map((item) => item.citationId));

    const m2Context = shapes.get("M2")!;
    expect(m2Context.packet.questionIntent).toBe("impact");
    expect(m2Context.packet.consequenceEvidenceState).toBeDefined();
    expect(Object.keys(m2Context.payload).sort()).toEqual([
      "citations",
      "consequenceEvidenceState",
      "evidenceBoundary",
      "impactChains",
      "impactPaths",
      "question",
      "requestedEntities",
      "requestedRelationshipType",
      "resolvedRelationships",
      "sameSubjectBackground",
      "unresolvedEvaluations",
    ]);
    expect(m2Context.payload.consequenceEvidenceState).toEqual(m2Context.packet.consequenceEvidenceState);
    expect(m2Context.payload.citations.map((item) => item.citationId))
      .toEqual(m2Context.packet.consequenceEvidenceState!.allowedCitationIds.filter((id) =>
        m2Context.packet.citations.some((citation) => citation.citationId === id),
      ));

    const e1Context = shapes.get("E1")!;
    expect(e1Context.packet.questionIntent).toBe("summary");
    expect(Object.keys(e1Context.payload).sort()).toEqual([
      "engineeringBrief",
      "engineeringInsights",
      "investigationSummary",
      "missingEvidence",
      "question",
      "recommendedInvestigationAreas",
      "strongestEvidence",
      "supportingContext",
      "topFindings",
      "topImpactChains",
      "unresolvedRelationships",
    ]);
    expect(retrievalSpy).not.toHaveBeenCalled();
  });
});
