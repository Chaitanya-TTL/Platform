import { describe, expect, it } from "vitest";
import { COPILOT_EVALUATION_CASES } from "../evals/cases";
import { buildInvestigationContext, engineeringPromptPayload } from "../context-builder";
import type { RetrievalEvidence } from "../retrieval/contracts";
import {
  buildSprint1A5GoldenInvestigation,
  buildSprint1A5Snapshot,
  relationshipsDocument,
} from "../../tests/sprint-1a5-fixture-support";

const m1 = COPILOT_EVALUATION_CASES.find((item) => item.roadmapIds.includes("M1"))!;
const e1 = COPILOT_EVALUATION_CASES.find((item) => item.roadmapIds.includes("E1"))!;
const m2Question = "What operational consequence follows from this Windchill part being represented as a SAP material?";
const m2Snapshot = buildSprint1A5Snapshot(buildSprint1A5GoldenInvestigation());
const m1Question = m1.question;
const e1Question = e1.question;

const retrievalEvidence: RetrievalEvidence = {
  schemaVersion: "1.0",
  evidenceId: "retrieval-evidence:fixture",
  citationId: "cite:retrieval-document:v1:fixture",
  chunkId: "chunk:fixture",
  documentId: "document:fixture",
  sourceApplication: "windchill",
  excerpt: "The fixture document describes a permitted document-content claim.",
  sectionPath: ["Design", "Requirements"],
  revision: "A",
  sourceReference: { sourceSystem: "windchill", nativeDocumentId: "DOC-42" },
  retrievalScore: 0.91,
  accessDecision: {
    decision: "allowed",
    policyVersion: "fixture-policy-v1",
    decidedAt: "2026-11-11T00:00:00.000Z",
  },
  provenance: {
    authority: "retrieved-document",
    sourceSystem: "windchill",
    extractedAt: "2026-11-11T00:00:00.000Z",
    contentHash: "fixture-hash",
  },
};

const m1PayloadKeys = [
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
].sort();
const m2PayloadKeys = [
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
].sort();
const e1PayloadKeys = m1PayloadKeys;

function buildM1Packet() {
  return buildInvestigationContext(m1.snapshot, m1Question);
}

function buildM2Packet() {
  return buildInvestigationContext(m2Snapshot, m2Question, { relationshipDocument: relationshipsDocument });
}

function buildE1Packet() {
  return buildInvestigationContext(e1.snapshot, e1Question);
}

describe("document intent and prompt projection", () => {
  it("classifies explicit document, specification, requirements, and manual questions", () => {
    const prompts = [
      "What does the design document say about this assembly?",
      "What does the specification say about the interface?",
      "Show the requirements for this component.",
      "Find the user manual for this product.",
    ];

    for (const question of prompts) {
      expect(buildInvestigationContext(m1.snapshot, question).questionIntent).toBe("document");
    }
  });

  it("preserves M1, M2, E1, and all existing intent classifications before document cues", () => {
    expect(buildM1Packet().questionIntent).toBe("relationship");
    expect(buildM2Packet().questionIntent).toBe("impact");
    expect(buildE1Packet().questionIntent).toBe("summary");

    const priorIntents = [
      ["Summarize this investigation only.", "summary"],
      ["Which applications are involved in this investigation and how are they connected?", "relationship"],
      ["What is the downstream impact of this part?", "impact"],
      ["What are the dependencies of this part?", "dependency"],
      ["What is the root cause of this defect?", "root-cause"],
      ["What risk is present?", "risk"],
      ["What changed in this revision?", "change-analysis"],
      ["What evidence supports this conclusion?", "evidence"],
    ] as const;
    for (const [question, intent] of priorIntents) {
      expect(buildInvestigationContext(m1.snapshot, question).questionIntent).toBe(intent);
    }

    const mixedQuestions = [
      ["What does the specification say about the downstream impact?", "impact"],
      ["Which manual describes the relationship between these entities?", "relationship"],
      ["Which requirements provide evidence for this conclusion?", "evidence"],
      ["What does the document say about the change notice?", "change-analysis"],
      ["What manual explains the risk and root cause?", "root-cause"],
      ["Which document describes the dependencies of this component?", "dependency"],
    ] as const;
    for (const [question, intent] of mixedQuestions) {
      expect(buildInvestigationContext(m1.snapshot, question).questionIntent).toBe(intent);
    }
  });

  it("classifies explicit cross-system Product 360 prompts without hijacking focused questions", () => {
    const broadQuestions = [
      "Tell me everything known about this product across all participating applications.",
      "Give me a Product 360 overview.",
      "Summarize this product across systems.",
      "What information is available for this product?",
      "Show me the complete investigation overview.",
    ];
    for (const question of broadQuestions) {
      expect(buildInvestigationContext(m1.snapshot, question).questionIntent).toBe("product-360");
    }

    const focusedQuestions = [
      [m1Question, "relationship"],
      [m2Question, "impact"],
      [e1Question, "summary"],
      ["What are the primary entities involved in this investigation?", "summary"],
      ["What is the SAP material?", "summary"],
      ["Which Configit families are available?", "summary"],
      ["Which requirements are available?", "document"],
      ["Which requirements are linked to the Windchill part?", "relationship"],
      ["What document explains this configuration?", "document"],
      ["What changed in the latest revision?", "change-analysis"],
      ["What risk is present?", "risk"],
      ["What is the root cause of this defect?", "root-cause"],
      ["Summarize this investigation only.", "summary"],
    ] as const;
    for (const [question, intent] of focusedQuestions) {
      expect(buildInvestigationContext(m1.snapshot, question).questionIntent).toBe(intent);
    }
  });

  it("scopes broad application overviews to a recognized application after focused-intent checks", () => {
    const applicationQuestions = [
      ["Tell me everything coming from Codebeamer for this product.", "codebeamer"],
      ["Tell me everything coming from Windchill for this product.", "windchill"],
      ["Tell me everything coming from SAP for this product.", "sap"],
      ["Tell me everything coming from Configit for this product.", "configit"],
    ] as const;

    for (const [question, application] of applicationQuestions) {
      const packet = buildInvestigationContext(m1.snapshot, question);
      expect(packet.questionIntent).toBe("application-overview");
      expect(packet.applicationOverviewApplication).toBe(application);
    }

    const focusedQuestions = [
      ["Which requirements are available in Codebeamer?", "document"],
      ["What is the SAP material?", "summary"],
      ["Which Configit families are available?", "summary"],
      ["Which Windchill document describes this part?", "document"],
      ["Which applications are involved in this investigation and how are they connected?", "relationship"],
      ["What operational consequence follows from this Windchill part being represented as a SAP material?", "impact"],
      ["What risk is present for this part?", "risk"],
      ["What changed in the latest revision?", "change-analysis"],
      ["What is the root cause of this defect?", "root-cause"],
      ["Give me a Product 360 overview.", "product-360"],
      ["Tell me everything from MRKT for this product.", "summary"],
    ] as const;

    for (const [question, intent] of focusedQuestions) {
      expect(buildInvestigationContext(m1.snapshot, question).questionIntent).toBe(intent);
    }
  });

  it("keeps M1, M2, and E1 packets and graph-only payload shapes unchanged without evidence", () => {
    const cases = [
      { question: m1Question, packet: buildM1Packet(), payloadKeys: m1PayloadKeys, intent: "relationship" },
      { question: m2Question, packet: buildM2Packet(), payloadKeys: m2PayloadKeys, intent: "impact" },
      { question: e1Question, packet: buildE1Packet(), payloadKeys: e1PayloadKeys, intent: "summary" },
    ] as const;

    for (const testCase of cases) {
      const packetBeforeProjection = JSON.stringify(testCase.packet);
      const payload = engineeringPromptPayload(testCase.question, testCase.packet);
      const emptyEvidencePayload = engineeringPromptPayload(testCase.question, testCase.packet, []);

      expect(testCase.packet.questionIntent).toBe(testCase.intent);
      expect(Object.keys(testCase.packet)).not.toContain("retrievedDocumentEvidence");
      expect(Object.keys(testCase.packet)).not.toContain("retrievalEvidence");
      expect(JSON.stringify(testCase.packet)).toBe(packetBeforeProjection);
      expect(Object.keys(payload).sort()).toEqual(testCase.payloadKeys);
      expect(JSON.stringify(emptyEvidencePayload)).toBe(JSON.stringify(payload));
      expect(payload).not.toHaveProperty("retrievedDocumentEvidence");
    }
  });

  it("adds supplied evidence only in the distinct retrieved-document section", () => {
    const graphOnlyPacket = buildM1Packet();
    const packet = {
      ...graphOnlyPacket,
      retrievalConfidence: {
        ...graphOnlyPacket.retrievalConfidence,
        score: 1,
        belowThreshold: false,
      },
    };
    const packetBeforeProjection = JSON.stringify(packet);
    const payload = engineeringPromptPayload(m1Question, packet, [retrievalEvidence]);
    const projectedSection = (payload as {
      retrievedDocumentEvidence?: {
        authority: string;
        evidence: readonly RetrievalEvidence[];
        uncertaintyBoundary?: string;
      };
    }).retrievedDocumentEvidence;

    expect(projectedSection).toEqual({
      authority: "retrieved-document",
      evidence: [retrievalEvidence],
    });
    expect(payload).not.toHaveProperty("retrievalEvidence");
    expect(JSON.stringify(packet)).toBe(packetBeforeProjection);
    expect(Object.keys(packet)).not.toContain("retrievedDocumentEvidence");
  });

  it("makes low graph confidence explicit in the optional section without changing the packet", () => {
    const packet = buildM1Packet();
    const lowConfidencePacket = {
      ...packet,
      retrievalConfidence: {
        ...packet.retrievalConfidence,
        score: 0.1,
        belowThreshold: true,
      },
    };
    const packetBeforeProjection = JSON.stringify(lowConfidencePacket);
    const payload = engineeringPromptPayload(m1Question, lowConfidencePacket, [retrievalEvidence]);
    const projectedSection = (payload as {
      retrievedDocumentEvidence?: {
        authority: string;
        evidence: readonly RetrievalEvidence[];
        uncertaintyBoundary?: string;
      };
    }).retrievedDocumentEvidence;

    expect(projectedSection?.uncertaintyBoundary).toMatch(
      /graph confidence is below the configured threshold.*document-content claims only.*do not establish.*relationships.*impact paths.*consequences/i,
    );
    expect(JSON.stringify(lowConfidencePacket)).toBe(packetBeforeProjection);
  });
});
