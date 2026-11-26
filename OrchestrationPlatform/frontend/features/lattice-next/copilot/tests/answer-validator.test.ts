import { describe, expect, it } from "vitest";
import type { InvestigationSnapshot } from "../../kernel/contracts/investigation-snapshot";
import type { EngineeringIntelligenceInvestigationV1, IntelligenceEntity } from "../../contracts/intelligence-v1";
import { buildInvestigationContext, stableCitationId } from "../context-builder";
import { CopilotAnswerValidationError, validateCopilotAnswer } from "../answer-validator";

const temporal = { capturedAt: "2026-10-22T08:00:00.000Z", assembledAt: "2026-10-22T08:01:00.000Z", freshness: "current" as const };
const testEntity: IntelligenceEntity = {
  id: "entity:wc-1001",
  kind: "part",
  displayName: "Housing",
  identityQuality: "native",
  assertion: "fact",
  properties: { partNumber: { type: "text", text: "WC-1001" } },
  provenance: { source: "windchill", provider: "fixture", nativeId: "WC-1001", observedAt: temporal.capturedAt, authority: "source-authoritative" },
  temporal,
};
const canonical: EngineeringIntelligenceInvestigationV1 = {
  contractVersion: "1.0",
  investigationId: "answer-validation-test",
  subject: {
    id: "subject:1",
    displayName: "Housing",
    candidateIds: [testEntity.id],
    confidence: "verified",
    reasons: [],
    provenance: { provider: "fixture", observedAt: temporal.capturedAt, authority: "backend-derived" },
    temporal,
  },
  entities: [testEntity],
  relationships: [],
  evidence: [{ id: "evidence:wc-1", kind: "record", summary: "Windchill part record", source: "windchill", provenance: testEntity.provenance, temporal }],
  findings: [],
  sources: [{ entityId: testEntity.id, source: "windchill", status: "available", provenance: testEntity.provenance }],
  identityClusters: [],
  temporal,
  summary: { entityCount: 1, relationshipCount: 0, evidenceCount: 1, findingCount: 0, availableSourceCount: 1, partialSourceCount: 0, status: "success" },
};
const snapshot: InvestigationSnapshot<EngineeringIntelligenceInvestigationV1> = {
  identity: { investigationId: "answer-validation-test" as InvestigationSnapshot["identity"]["investigationId"], revision: 3, executionEpoch: 1 },
  lifecycle: "ready",
  subjectLabel: "Housing",
  query: "Housing",
  selections: [{ source: "windchill", nativeId: "WC-1001", displayName: "Housing" }],
  executions: {},
  acceptedEvidenceIds: [],
  completeness: { overall: "complete", requestedSources: ["windchill"], successfulSources: ["windchill"], partialSources: [], failedSources: [], pendingSources: [], limitations: [] },
  canonical: { revision: 3, publishedAt: temporal.assembledAt, value: canonical },
  warnings: [],
  createdAt: temporal.capturedAt,
  updatedAt: temporal.assembledAt,
};
const context = buildInvestigationContext(snapshot, "What is WC-1001?");
const entityCitation = stableCitationId("entity", testEntity.id);
const evidenceCitation = stableCitationId("evidence", "evidence:wc-1");

function answer(overrides: Record<string, unknown> = {}) {
  return {
    answer: "The selected record is Housing.",
    claims: [{ text: "The record is Housing.", kind: "fact", citationIds: [entityCitation] }],
    recommendations: [{ text: "Review its source record.", rationale: "The identifier is source-native.", citationIds: [entityCitation, evidenceCitation], approvalRequired: true }],
    uncertainties: [],
    followUpQuestions: [],
    snapshotRevision: 3,
    ...overrides,
  };
}

describe("copilot answer citation validation", () => {
  it("accepts a well-formed answer with active-snapshot citations and approval-gated recommendations", () => {
    const validated = validateCopilotAnswer(answer(), context);
    expect(validated.snapshotRevision).toBe(3);
    expect(validated.claims[0].citationIds).toEqual([entityCitation]);
    expect(validated.recommendations[0].approvalRequired).toBe(true);
  });

  it("accepts cited source-status facts from the active snapshot", () => {
    const sourceCitation = stableCitationId("source", "windchill");
    const validated = validateCopilotAnswer(answer({
      claims: [{ text: "Windchill source status is current.", kind: "fact", citationIds: [sourceCitation] }],
      recommendations: [],
    }), context);
    expect(validated.claims[0].citationIds).toEqual([sourceCitation]);
    expect(validated.citations).toContainEqual(expect.objectContaining({ citationId: sourceCitation, kind: "source" }));
  });

  it("rejects malformed answers and factual claims without citations", () => {
    expect(() => validateCopilotAnswer({ answer: "", claims: "bad" }, context)).toThrow(CopilotAnswerValidationError);
    expect(() => validateCopilotAnswer(answer({ claims: [{ text: "Unsupported fact", kind: "fact", citationIds: [] }] }), context))
      .toThrow(/factual claims require citations/i);
  });

  it("rejects invented citation IDs", () => {
    expect(() => validateCopilotAnswer(answer({ claims: [{ text: "A fact", kind: "fact", citationIds: ["cite:entity:invented"] }] }), context))
      .toThrow(/unknown citation/i);
  });

  it("rejects mismatched snapshot revisions", () => {
    expect(() => validateCopilotAnswer(answer({ snapshotRevision: 2 }), context))
      .toThrow(/snapshot revision/i);
  });

  it("omits recommendations that do not require engineer approval", () => {
    const validated = validateCopilotAnswer(answer({
      recommendations: [{ text: "Change the part", rationale: "Recommended", citationIds: [entityCitation], approvalRequired: false }],
    }), context);
    expect(validated.recommendations).toEqual([]);
  });

  it("omits recommendations without citations and rejects malformed factual citation arrays", () => {
    const validated = validateCopilotAnswer(answer({ recommendations: [{ text: "Review", rationale: "Useful", citationIds: [], approvalRequired: true }] }), context);
    expect(validated.recommendations).toEqual([]);
    expect(() => validateCopilotAnswer(answer({ claims: [{ text: "Fact", kind: "fact", citationIds: "not-an-array" }] }), context))
      .toThrow(/citationIds/i);
  });

  it("reports each accepted or rejected assertion without changing the validated answer", () => {
    const outcomes: Parameters<NonNullable<Parameters<typeof validateCopilotAnswer>[2]>>[0][] = [];
    expect(() => validateCopilotAnswer(answer({
      claims: [
        { text: "The record is Housing.", kind: "fact", citationIds: [entityCitation] },
        { text: "A fabricated record exists.", kind: "fact", citationIds: ["cite:entity:invented"] },
      ],
    }), context, (outcome) => outcomes.push(outcome))).toThrow(/unknown citation ID/i);

    expect(outcomes).toEqual([
      { assertionType: "claim", assertionIndex: 0, accepted: true, citationIds: [entityCitation] },
      {
        assertionType: "claim",
        assertionIndex: 1,
        accepted: false,
        citationIds: ["cite:entity:invented"],
        issue: "claims[1].citationIds contains an unknown citation ID.",
      },
    ]);
  });

  it("reports rejected optional recommendations while retaining the existing omission behavior", () => {
    const outcomes: Parameters<NonNullable<Parameters<typeof validateCopilotAnswer>[2]>>[0][] = [];
    const validated = validateCopilotAnswer(answer({
      recommendations: [
        { text: "Review the source.", rationale: "Useful.", citationIds: [entityCitation], approvalRequired: true },
        { text: "Change the part.", rationale: "Suggested action.", citationIds: [entityCitation], approvalRequired: false },
      ],
    }), context, (outcome) => outcomes.push(outcome));

    expect(validated.recommendations).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.assertionType === "recommendation")).toEqual([
      { assertionType: "recommendation", assertionIndex: 0, accepted: true, citationIds: [entityCitation] },
      {
        assertionType: "recommendation",
        assertionIndex: 1,
        accepted: false,
        citationIds: [entityCitation],
        issue: "recommendations[1] must require engineer approval.",
      },
    ]);
  });

  it("keeps a grounded answer when an optional recommendation lacks valid citations", () => {
    const validated = validateCopilotAnswer(answer({
      recommendations: [{ text: "Inspect the source.", rationale: "The model could not cite a record.", citationIds: [], approvalRequired: true }],
    }), context);

    expect(validated.answer).toBe("The selected record is Housing.");
    expect(validated.recommendations).toEqual([]);
  });

  it("preserves supported answers and claims beyond the former application size limits", () => {
    const longAnswer = "Supported answer. ".repeat(1_000);
    const longClaim = "The source record supports this statement. ".repeat(110);
    const claims = Array.from({ length: 101 }, (_, index) => ({
      text: `${index}: ${longClaim}`,
      kind: "fact",
      citationIds: [entityCitation],
    }));

    const validated = validateCopilotAnswer(answer({
      answer: longAnswer,
      claims,
      uncertainties: Array.from({ length: 101 }, () => "The available evidence does not resolve this detail. ".repeat(50)),
      followUpQuestions: Array.from({ length: 101 }, (_, index) => `Follow-up ${index}: ${"which source field? ".repeat(120)}`),
    }), context);

    expect(validated.answer).toBe(longAnswer.trim());
    expect(validated.claims).toHaveLength(101);
    expect(validated.claims[0].text.length).toBeGreaterThan(4_000);
    expect(validated.uncertainties).toHaveLength(101);
    expect(validated.followUpQuestions).toHaveLength(101);
  });
});
