import { describe, expect, it } from "vitest";
import type { InvestigationSnapshot } from "../../kernel/contracts/investigation-snapshot";
import type { EngineeringIntelligenceInvestigationV1, IntelligenceEntity } from "../../contracts/intelligence-v1";
import { buildInvestigationContext, stableCitationId } from "../context-builder";
import {
  CopilotAnswerValidationError,
  validateCopilotAnswer,
  type CopilotValidationDiagnostics,
} from "../answer-validator";
import type { ConsequenceEvidenceState, CopilotCitation, CopilotEntityContext } from "../contracts";

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
const sapEntity: CopilotEntityContext = {
  entityId: "sap:material:mat-1",
  citationId: stableCitationId("entity", "sap:material:mat-1"),
  displayName: "Material MAT-1",
  kind: "material",
  identityQuality: "native",
  source: "sap",
  nativeId: "MAT-1",
  properties: {},
  freshness: "current",
};
const sapEntityCitation = sapEntity.citationId;
const evaluationCitation = stableCitationId("evaluation", "WC_PART_TO_SAP_MATERIAL:fixture");
const subjectTraceabilityCitation = stableCitationId("relationship", "subject-traceability:fixture");
const consequenceEvidenceState: ConsequenceEvidenceState = {
  intent: "consequence",
  requestedRelationshipType: "operationally-represented-as",
  sourceApplication: "windchill",
  targetApplication: "sap",
  sourceEntityId: testEntity.id,
  targetEntityId: sapEntity.entityId,
  sameInvestigationSubject: true,
  ontologyRelationshipEstablished: false,
  eligibleImpactPathAvailable: false,
  eligibleImpactChainAvailable: false,
  unresolvedEvaluationAvailable: true,
  allowedConclusion: "insufficient-evidence",
  allowedCitationIds: [entityCitation, sapEntityCitation, evaluationCitation, subjectTraceabilityCitation],
  sourceEntityCitationIds: [entityCitation],
  targetEntityCitationIds: [sapEntityCitation],
  subjectTraceabilityCitationIds: [subjectTraceabilityCitation],
  unresolvedEvaluationCitationIds: [evaluationCitation],
  resolvedRelationshipCitationIds: [],
  impactPathCitationIds: [],
  impactChainCitationIds: [],
  specificEffectCitationIds: [],
  specificEffectCitationIdsByCategory: {},
  prohibitedClaimCategories: ["unsupported-operational-impact", "unsupported-specific-operational-effect"],
};
const consequenceCitations: CopilotCitation[] = [
  ...context.citations,
  { citationId: sapEntityCitation, kind: "entity", label: "Material MAT-1", source: "sap", nativeId: "MAT-1" },
  { citationId: evaluationCitation, kind: "evaluation", label: "WC_PART_TO_SAP_MATERIAL unresolved evaluation" },
  { citationId: subjectTraceabilityCitation, kind: "relationship", label: "Shared investigation participation" },
];
const consequenceContext = {
  ...context,
  questionIntent: "impact" as const,
  entities: [...context.entities, sapEntity],
  citations: consequenceCitations,
  consequenceEvidenceState,
};

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

  it("keeps a grounded answer when an optional recommendation lacks valid citations", () => {
    const validated = validateCopilotAnswer(answer({
      recommendations: [{ text: "Inspect the source.", rationale: "The model could not cite a record.", citationIds: [], approvalRequired: true }],
    }), context);

    expect(validated.answer).toBe("The selected record is Housing.");
    expect(validated.recommendations).toEqual([]);
  });

  // The historical M2 journal retained only the generic missing-citation error, not prompt IDs, returned IDs, or claim text.
  it("accepts an insufficient-evidence M2 conclusion without an impact-path citation", () => {
    const validated = validateCopilotAnswer({
      answer: "The available evidence does not establish that the Windchill part is operationally represented as the SAP material, so no operational consequence can currently be established.",
      claims: [{
        text: "The available evidence does not establish the requested operational representation.",
        kind: "fact",
        citationIds: [entityCitation, sapEntityCitation, evaluationCitation],
      }],
      recommendations: [],
      uncertainties: ["Evidence establishing the requested relationship is unavailable."],
      followUpQuestions: [],
      snapshotRevision: 3,
    }, consequenceContext);

    expect(validated.claims[0].citationIds).toEqual([entityCitation, sapEntityCitation, evaluationCitation]);
    expect(validated.citations.map((citation) => citation.citationId)).toEqual(expect.arrayContaining([
      entityCitation,
      sapEntityCitation,
      evaluationCitation,
    ]));
  });

  it("records and rejects an unknown M2 citation without losing valid citation IDs", () => {
    const diagnostics: CopilotValidationDiagnostics = {
      promptCitationIds: [],
      providerCitationIds: [],
      unknownCitationIds: [],
      uncitedFactualClaimCount: 0,
      claimRequirements: [],
      validationOutcome: "failed",
    };
    expect(() => validateCopilotAnswer({
      answer: "The available evidence does not establish the requested operational representation.",
      claims: [{
        text: "The available evidence does not establish the requested operational representation.",
        kind: "fact",
        citationIds: [entityCitation, "cite:entity:unknown", evaluationCitation],
      }],
      recommendations: [],
      uncertainties: [],
      followUpQuestions: [],
      snapshotRevision: 3,
    }, consequenceContext, diagnostics)).toThrow(/unknown citation/i);

    expect(diagnostics.unknownCitationIds).toEqual(["cite:entity:unknown"]);
    expect(diagnostics.providerCitationIds).toEqual([entityCitation, "cite:entity:unknown", evaluationCitation]);
  });

  it("records uncited factual claims and their required citation type", () => {
    const diagnostics: CopilotValidationDiagnostics = {
      promptCitationIds: [],
      providerCitationIds: [],
      unknownCitationIds: [],
      uncitedFactualClaimCount: 0,
      claimRequirements: [],
      validationOutcome: "failed",
    };
    expect(() => validateCopilotAnswer({
      answer: "The available evidence does not establish the requested operational representation.",
      claims: [{
        text: "The available evidence does not establish the requested operational representation.",
        kind: "fact",
        citationIds: [],
      }],
      recommendations: [],
      uncertainties: [],
      followUpQuestions: [],
      snapshotRevision: 3,
    }, consequenceContext, diagnostics)).toThrow(/factual claims require citations/i);

    expect(diagnostics.uncitedFactualClaimCount).toBe(1);
    expect(diagnostics.claimRequirements).toEqual([{
      claimType: "relationship-not-established",
      requiredCitationType: "selected entity or matching unresolved evaluation",
    }]);
  });

  it("allows subject-traceability citations only for same-investigation background", () => {
    expect(validateCopilotAnswer({
      answer: "Windchill and SAP records participate in the same Steering investigation.",
      claims: [{
        text: "Windchill and SAP records participate in the same investigation.",
        kind: "fact",
        citationIds: [subjectTraceabilityCitation],
      }],
      recommendations: [],
      uncertainties: [],
      followUpQuestions: [],
      snapshotRevision: 3,
    }, consequenceContext).claims[0].citationIds).toEqual([subjectTraceabilityCitation]);

    expect(() => validateCopilotAnswer({
      answer: "The available evidence does not establish that the records are operationally represented.",
      claims: [{
        text: "The available evidence does not establish the operational representation.",
        kind: "fact",
        citationIds: [subjectTraceabilityCitation],
      }],
      recommendations: [],
      uncertainties: [],
      followUpQuestions: [],
      snapshotRevision: 3,
    }, consequenceContext)).toThrow(/selected entity or matching unresolved evaluation/i);
  });

  it("rejects unsupported operational effects in an insufficient-evidence M2 answer", () => {
    expect(() => validateCopilotAnswer({
      answer: "The available evidence does not establish a relationship, but this could cause inventory misalignment.",
      claims: [{
        text: "This could cause inventory misalignment.",
        kind: "hypothesis",
        citationIds: [entityCitation, evaluationCitation],
      }],
      recommendations: [],
      uncertainties: [],
      followUpQuestions: [],
      snapshotRevision: 3,
    }, consequenceContext)).toThrow(/specific operational effect|explicit evidence/i);
  });

  it("requires both a resolved relationship and impact citation for a positive impact claim", () => {
    const relationshipCitation = stableCitationId("relationship", "resolved:wc-part-to-sap-material");
    const pathEvidenceCitation = stableCitationId("evidence", "impact:path-evidence");
    const evidenceBackedState: ConsequenceEvidenceState = {
      ...consequenceEvidenceState,
      ontologyRelationshipEstablished: true,
      eligibleImpactPathAvailable: true,
      allowedConclusion: "evidence-backed-potential-impact",
      allowedCitationIds: [...consequenceEvidenceState.allowedCitationIds, relationshipCitation, pathEvidenceCitation],
      resolvedRelationshipCitationIds: [relationshipCitation],
      impactPathCitationIds: [pathEvidenceCitation],
    };
    const evidenceBackedContext = {
      ...consequenceContext,
      consequenceEvidenceState: evidenceBackedState,
      citations: [
        ...consequenceContext.citations,
        { citationId: relationshipCitation, kind: "relationship", label: "Operational representation" } as CopilotCitation,
        { citationId: pathEvidenceCitation, kind: "evidence", label: "Eligible impact path evidence" } as CopilotCitation,
      ],
    };
    const answerWithImpact = {
      answer: "The part may have an operational impact on the SAP material.",
      claims: [{
        text: "The part may have an operational impact on the SAP material.",
        kind: "hypothesis",
        citationIds: [relationshipCitation, pathEvidenceCitation],
      }],
      recommendations: [],
      uncertainties: [],
      followUpQuestions: [],
      snapshotRevision: 3,
    };

    expect(validateCopilotAnswer(answerWithImpact, evidenceBackedContext).claims).toHaveLength(1);
    expect(() => validateCopilotAnswer({
      ...answerWithImpact,
      claims: [{ ...answerWithImpact.claims[0], citationIds: [relationshipCitation] }],
    }, evidenceBackedContext)).toThrow(/resolved relationship and eligible impact evidence/i);
  });
});
