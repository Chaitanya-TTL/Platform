import { describe, expect, it } from "vitest";
import { validateCopilotAnswer } from "../copilot/answer-validator";
import { buildInvestigationContext, engineeringPromptPayload } from "../copilot/context-builder";
import {
  buildSprint1A5GoldenInvestigation,
  buildSprint1A5Snapshot,
  relationshipsDocument,
} from "./sprint-1a5-fixture-support";

const questions = [
  "Which applications are involved in this investigation and how are they connected?",
  "What operational consequence follows from this Windchill part being represented as a SAP material?",
];

describe("reasoning intelligence budget preservation", () => {
  it.each(questions)("preserves available reasoning artifacts within budget for: %s", (question) => {
    const packet = buildInvestigationContext(
      buildSprint1A5Snapshot(buildSprint1A5GoldenInvestigation()),
      question,
      { relationshipDocument: relationshipsDocument },
    );

    if (question.startsWith("Which applications")) {
      expect(packet.engineeringBrief.subjectApplicationParticipation.length).toBeGreaterThan(0);
      const applications = packet.engineeringBrief.subjectApplicationParticipation.map((item) => item.application);
      if (applications.length === 4 && applications.includes("Configit")) {
        expect(packet.reasoningPackage.subjectTraceabilityNarratives).toHaveLength(0);
      } else {
        expect(packet.reasoningPackage.subjectTraceabilityNarratives.length).toBeGreaterThan(0);
      }
    } else {
      expect(packet.reasoningPackage.relationshipNarratives.length).toBeGreaterThanOrEqual(1);
      expect(packet.reasoningPackage.impactNarratives.length).toBeGreaterThanOrEqual(1);
      expect(packet.reasoningPackage.impactChains.length).toBeGreaterThanOrEqual(1);
    }
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(packet.omissions.maxContextChars);
  });

  it("projects only M2-unused engineering-brief fields before the packet budget check", () => {
    const packet = buildInvestigationContext(
      buildSprint1A5Snapshot(buildSprint1A5GoldenInvestigation()),
      questions[1],
      { relationshipDocument: relationshipsDocument },
    );
    const consequence = packet.consequenceEvidenceState;
    expect(consequence).toBeDefined();
    if (!consequence) throw new Error("The M2 fixture must produce consequence evidence state.");

    const serializedPacketSize = JSON.stringify(packet).length;
    expect(serializedPacketSize).toBe(21_648);
    expect(serializedPacketSize).toBeLessThanOrEqual(22_500);
    expect(27_162 - serializedPacketSize).toBe(5_514);
    expect(22_500 - serializedPacketSize).toBe(852);

    expect(packet.engineeringBrief).toMatchObject({
      executiveSummary: "",
      crossSystemSummary: "",
      applicationsPresent: [],
      subjectParticipationSummary: "",
      crossSystemParticipationSummary: "",
      primaryEntities: [],
      majorRelationships: [],
      relationshipNarratives: [],
      subjectTraceabilityRelationships: [],
      subjectTraceabilityNarratives: [],
      subjectApplicationParticipation: [],
      representativeEntitiesByApplication: {},
      evidenceBoundaryStatement: "",
      topImpactChains: [],
      relationshipEvidence: [],
      engineeringInsights: [],
      topFindings: [],
      strongestEvidence: [],
      missingEvidence: [],
      unresolvedRelationships: [],
      recommendedInvestigationAreas: [],
    });
    expect(packet.engineeringBrief.impactNarratives.length).toBeGreaterThan(0);
    expect(packet.engineeringBrief.relationshipFlow).toEqual({
      ontologyGraph: {
        relationshipCount: 0,
        impactPathCount: 0,
        impactChainCount: 0,
        unresolvedRelationshipCount: 0,
        evidenceCount: 0,
        relationshipDefinitionCount: 0,
      },
      reasoningPackage: {
        relationshipCount: 0,
        impactPathCount: 0,
        impactChainCount: 0,
        unresolvedRelationshipCount: 0,
        evidenceCount: 0,
      },
      engineeringBrief: {
        relationshipCount: 0,
        impactPathCount: 0,
        impactChainCount: 0,
        unresolvedRelationshipCount: 0,
        evidenceCount: 0,
        relationshipNarrativeCount: 0,
        impactNarrativeCount: 0,
      },
    });

    const providerPayload = engineeringPromptPayload(questions[1], packet);
    const preProjectionPacket = {
      ...packet,
      engineeringBrief: {
        ...packet.engineeringBrief,
        executiveSummary: "Full engineering summary before M2 projection.",
        crossSystemSummary: packet.reasoningPackage.investigationSummary.crossSystemSummary,
        applicationsPresent: packet.reasoningPackage.applicationsPresent,
        subjectParticipationSummary: packet.reasoningPackage.subjectParticipationSummary,
        crossSystemParticipationSummary: packet.reasoningPackage.crossSystemParticipationSummary,
        primaryEntities: packet.reasoningPackage.primaryEntities,
        majorRelationships: packet.relationships,
        relationshipNarratives: packet.reasoningPackage.relationshipNarratives,
        subjectTraceabilityRelationships: packet.reasoningPackage.subjectTraceabilityRelationships,
        subjectTraceabilityNarratives: packet.reasoningPackage.subjectTraceabilityNarratives,
        subjectApplicationParticipation: packet.reasoningPackage.subjectApplicationParticipation.map((item) => ({
          subjectId: item.subjectId,
          subjectLabel: item.subjectLabel,
          application: item.application,
          participantCount: item.participantCount,
          representativeEntityIds: item.representativeEntityIds,
          representativeEntityLabels: item.representativeEntityLabels,
          representativeEntityKinds: item.representativeEntityKinds,
          contribution: "participates in the M2 investigation subject",
        })),
        representativeEntitiesByApplication: packet.reasoningPackage.representativeEntitiesByApplication,
        evidenceBoundaryStatement: packet.reasoningPackage.evidenceBoundaryStatement,
        relationshipEvidence: packet.evidence,
        engineeringInsights: packet.reasoningPackage.engineeringFindings,
        topFindings: packet.reasoningPackage.engineeringFindings,
        topImpactChains: packet.reasoningPackage.impactChains,
        strongestEvidence: packet.reasoningPackage.strongestEvidence,
        missingEvidence: packet.reasoningPackage.missingEvidence,
        unresolvedRelationships: packet.reasoningPackage.unresolvedRelationships,
      },
    };
    expect(providerPayload).toEqual(engineeringPromptPayload(questions[1], preProjectionPacket));
    expect(providerPayload.consequenceEvidenceState).toEqual(consequence);

    const endpointEntityIds = new Set(packet.entities.map((entity) => entity.entityId));
    expect(endpointEntityIds.has(consequence.sourceEntityId!)).toBe(true);
    expect(endpointEntityIds.has(consequence.targetEntityId!)).toBe(true);
    expect(packet.relationships.map((relationship) => relationship.citationId)).toEqual(
      expect.arrayContaining(consequence.resolvedRelationshipCitationIds),
    );
    expect(providerPayload.resolvedRelationships.map((relationship) => relationship.relationshipId)).toEqual(
      packet.relationships
        .filter((relationship) => consequence.resolvedRelationshipCitationIds.includes(relationship.citationId))
        .map((relationship) => relationship.relationshipId),
    );
    expect(providerPayload.impactPaths.map((path) => path.id)).toEqual(
      packet.impactPaths
        .filter((path) =>
          path.impactEligible &&
          path.relationshipIds.some((relationshipId) =>
            providerPayload.resolvedRelationships.some((relationship) =>
              relationship.relationshipId === relationshipId,
            ),
          ),
        )
        .map((path) => path.id),
    );
    expect(packet.impactPaths.length).toBeGreaterThan(0);
    expect(providerPayload.impactChains.map((chain) => chain.id)).toEqual(
      packet.reasoningPackage.impactChains
        .filter((chain) =>
          chain.relationshipIds.some((relationshipId) =>
            providerPayload.resolvedRelationships.some((relationship) =>
              relationship.relationshipId === relationshipId,
            ),
          ),
        )
        .map((chain) => chain.id),
    );
    expect(packet.reasoningPackage.relationshipNarratives.length).toBeGreaterThan(0);
    expect(packet.reasoningPackage.impactNarratives.length).toBeGreaterThan(0);
    expect(packet.reasoningPackage.impactChains.length).toBeGreaterThan(0);
    expect(packet.evidence.length).toBeGreaterThan(0);
    expect(packet.citations.map((citation) => citation.citationId)).toEqual(
      expect.arrayContaining(consequence.allowedCitationIds),
    );
    expect(packet.evidence.every((item) =>
      consequence.allowedCitationIds.includes(item.citationId),
    )).toBe(true);
    expect(providerPayload.citations.map((citation) => citation.citationId)).toEqual(
      packet.citations.map((citation) => citation.citationId),
    );

    const invalidEffectAnswer = {
      answer: "The relationship could cause inventory misalignment.",
      claims: [{
        text: "The relationship could cause inventory misalignment.",
        kind: "hypothesis",
        citationIds: consequence.sourceEntityCitationIds,
      }],
      recommendations: [],
      uncertainties: [],
      followUpQuestions: [],
      snapshotRevision: packet.snapshotRevision,
    };
    expect(() => validateCopilotAnswer(invalidEffectAnswer, packet))
      .toThrow(/specific operational effect|explicit evidence/i);
    expect(() => validateCopilotAnswer({
      ...invalidEffectAnswer,
      answer: "The available evidence does not establish the requested relationship.",
      claims: [{
        text: "The available evidence does not establish the requested relationship.",
        kind: "fact",
        citationIds: ["cite:entity:unknown-m2-budget-test"],
      }],
    }, packet)).toThrow(/unknown citation/i);
  });

  it("fails with protected-category diagnostics when the minimum packet budget cannot fit", () => {
    const canonical = buildSprint1A5GoldenInvestigation();

    expect(() => buildInvestigationContext(
      buildSprint1A5Snapshot(canonical),
      questions[1],
      { maxContextChars: 2_048, relationshipDocument: relationshipsDocument },
    )).toThrow(/Context budget exceeded[\s\S]*relationship narratives[\s\S]*impact narratives[\s\S]*impact chains[\s\S]*2048/);
  });
});
