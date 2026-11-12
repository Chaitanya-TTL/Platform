import { describe, expect, it } from "vitest";
import type { InvestigationSnapshot } from "../kernel/contracts/investigation-snapshot";
import type {
  EngineeringIntelligenceInvestigationV1,
  EngineeringProvenance,
  IntelligenceEntity,
} from "../contracts/intelligence-v1";
import {
  buildInvestigationContext,
  engineeringPromptPayload,
  ensureEngineeringAnswerCoverage,
} from "../copilot/context-builder";
import type { LatticeRelationshipOntology } from "../plm-brain/contracts/relationship-ontology";
import { enrichInvestigationWithOntology } from "../plm-brain/universal/ontology-evaluator";

const capturedAt = "2026-11-05T00:00:00.000Z";
const temporal = {
  capturedAt,
  assembledAt: capturedAt,
  freshness: "current" as const,
};
const ontology: LatticeRelationshipOntology = {
  schemaVersion: "1.0",
  ontologyVersion: "subject-traceability-test",
  applications: ["windchill", "sap", "configit", "codebeamer"],
  relationshipDefinitions: [],
  impactPathTemplates: [],
};

function entity(
  id: string,
  source: EngineeringProvenance["source"],
  kind: string,
  nativeId: string,
): IntelligenceEntity {
  return {
    id,
    kind,
    displayName: `${source ?? "Unknown"} ${kind}`,
    identityQuality: "native",
    assertion: "fact",
    properties: {},
    provenance: {
      ...(source ? { source } : {}),
      provider: `${source ?? "unknown"}-fixture`,
      nativeId,
      observedAt: capturedAt,
      authority: "source-authoritative",
    },
    temporal,
  };
}

function investigation(entities: IntelligenceEntity[]): EngineeringIntelligenceInvestigationV1 {
  const sources = [...new Set(entities.flatMap((item) => item.provenance.source ? [item.provenance.source] : []))];
  return {
    contractVersion: "1.0",
    investigationId: "investigation-subject-traceability",
    subject: {
      id: "subject:steering",
      displayName: "Steering",
      candidateIds: entities.map((item) => item.id),
      confidence: "verified",
      reasons: ["selected investigation subject"],
      provenance: {
        provider: "subject-resolution-fixture",
        observedAt: capturedAt,
        authority: "backend-derived",
      },
      temporal,
    },
    entities,
    relationships: [],
    evidence: [],
    findings: [],
    sources: entities.flatMap((item) => item.provenance.source ? [{
      entityId: item.id,
      source: item.provenance.source,
      status: "available" as const,
      provenance: item.provenance,
    }] : []),
    identityClusters: [],
    temporal,
    summary: {
      entityCount: entities.length,
      relationshipCount: 0,
      evidenceCount: 0,
      findingCount: 0,
      availableSourceCount: sources.length,
      partialSourceCount: 0,
      status: "success",
    },
  };
}

function snapshot(value: EngineeringIntelligenceInvestigationV1): InvestigationSnapshot<EngineeringIntelligenceInvestigationV1> {
  const sources = [...new Set(value.entities.flatMap((item) => item.provenance.source ? [item.provenance.source] : []))];
  return {
    identity: {
      investigationId: value.investigationId as InvestigationSnapshot["identity"]["investigationId"],
      revision: 7,
      executionEpoch: 1,
    },
    lifecycle: "ready",
    subjectLabel: value.subject.displayName,
    query: value.subject.displayName,
    selections: sources.map((source) => ({
      source,
      nativeId: value.entities.find((item) => item.provenance.source === source)?.provenance.nativeId ?? "",
      displayName: source,
    })),
    executions: {},
    acceptedEvidenceIds: [],
    completeness: {
      overall: "complete",
      requestedSources: sources,
      successfulSources: sources,
      partialSources: [],
      failedSources: [],
      pendingSources: [],
      limitations: [],
    },
    canonical: { revision: 7, publishedAt: capturedAt, value },
    warnings: [],
    createdAt: capturedAt,
    updatedAt: capturedAt,
  };
}

function graphFor(value: EngineeringIntelligenceInvestigationV1) {
  return enrichInvestigationWithOntology(value, ontology, 7).knowledgeGraph!;
}

describe("subject traceability graph", () => {
  const participants = [
    entity("wc:part:1", "windchill", "part", "WC-1"),
    entity("sap:material:1", "sap", "material", "SAP-1"),
    entity("configit:model:1", "configit", "product-model", "CFG-1"),
    entity("codebeamer:requirement:1", "codebeamer", "requirement", "CB-1"),
  ];

  it("materializes provenance-bearing participant edges to one investigation subject", () => {
    const graph = graphFor(investigation(participants));
    const subjectNode = graph.entities.find((item) => item.kind === "investigation-subject");
    const edges = graph.subjectTraceabilityRelationships;

    expect(subjectNode).toMatchObject({ label: "Steering", kind: "investigation-subject" });
    expect(edges).toHaveLength(participants.length);
    expect(edges.map((edge) => edge.sourceEntityId).sort()).toEqual(participants.map((item) => item.id).sort());
    expect(new Set(edges.map((edge) => edge.targetEntityId))).toEqual(new Set([subjectNode!.id]));
    expect(edges.every((edge) => edge.category === "subject-traceability")).toBe(true);
    expect(edges.every((edge) => edge.relationshipType === "represents-subject")).toBe(true);
    expect(edges.every((edge) => edge.status === "subject-derived")).toBe(true);
    expect(edges.every((edge) => edge.authority === "investigation")).toBe(true);
    expect(edges.every((edge) => edge.strength === "informational")).toBe(true);
    expect(edges.every((edge) => edge.impactEligible === false)).toBe(true);
    const windchillEdge = edges.find((edge) => edge.sourceEntityId === "wc:part:1");
    expect(windchillEdge).toMatchObject({
      sourceApplication: "windchill",
      sourceNativeId: "WC-1",
    });
    expect(windchillEdge?.provenance).toMatchObject({
      provider: "lattice-subject-traceability",
      authority: "investigation",
      observedAt: capturedAt,
      investigationId: "investigation-subject-traceability",
      subjectId: "subject:steering",
      sourceApplication: "windchill",
      sourceNativeId: "WC-1",
    });
  });

  it("keeps subject traceability separate from ontology and impact relationships", () => {
    const graph = graphFor(investigation(participants));
    const subjectEdgeIds = new Set(graph.subjectTraceabilityRelationships.map((edge) => edge.id));

    expect(graph.canonicalRelationships.every((edge) => !subjectEdgeIds.has(edge.id))).toBe(true);
    expect(graph.resolvedRelationships.every((edge) => !subjectEdgeIds.has(edge.id))).toBe(true);
    expect(graph.impactPaths.every((path) => path.relationshipIds.every((id) => !subjectEdgeIds.has(id)))).toBe(true);
    expect((graph.impactChains ?? []).every((chain) => chain.relationshipIds.every((id) => !subjectEdgeIds.has(id)))).toBe(true);
    expect(graph.subjectTraceabilityRelationships.every((edge) => !graph.impactPaths.some((path) =>
      path.relationshipIds.includes(edge.id),
    ))).toBe(true);
  });

  it.each([
    "Which applications are involved in this investigation and how are they connected?",
    "Which applications are involved in this investigation?",
    "How are systems connected?",
    "What entities participate in this investigation?",
  ])("uses authoritative subject edges for investigation connectivity questions: %s", (question) => {
    const sources = ["windchill", "sap", "configit", "codebeamer"] as const;
    const m1Participants = [
      ...participants,
      ...Array.from({ length: 76 }, (_, index) => {
        const source = sources[index % sources.length];
        return entity(`${source}:participant:${index}`, source, "record", `${source}-${index}`);
      }),
    ];
    const value = investigation(m1Participants);
    value.identityClusters = [{
      id: "cluster:participants",
      entityIds: m1Participants.map((item) => item.id),
      confidence: "provisional",
      reasons: ["same investigation subject"],
      evidenceIds: [],
    }];
    value.knowledgeGraph = graphFor(value);
    const packet = buildInvestigationContext(
      snapshot(value),
      question,
      { maxContextChars: 22_500 },
    );
    expect(value.knowledgeGraph!.subjectTraceabilityRelationships).toHaveLength(m1Participants.length);
    expect(packet.reasoningPackage.subjectTraceabilityRelationships).toHaveLength(0);
    expect(packet.relationships.some((item) => item.family === "projection:domain:cross-source")).toBe(false);
    expect(packet.reasoningPackage.subjectTraceabilityNarratives).toHaveLength(0);
    expect(packet.engineeringBrief.applicationsPresent).toEqual([
      "Codebeamer",
      "Windchill",
      "SAP",
      "Configit",
    ]);
    const connectivityNarrative =
      "Codebeamer, Windchill, SAP, and Configit contribute records to the same Steering investigation subject. " +
      "Shared subject participation does not establish a direct engineering relationship between their records.";
    expect(packet.reasoningPackage.investigationSummary.subjectParticipationSummary).toBe("");
    expect(packet.engineeringBrief.crossSystemParticipationSummary)
      .toBe("Codebeamer, Windchill, SAP, and Configit contribute records to the same Steering investigation subject.");
    expect(packet.engineeringBrief.subjectTraceabilityRelationships).toHaveLength(0);
    expect(packet.engineeringBrief.subjectTraceabilityNarratives).toHaveLength(0);
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(22_500);
    const prompt = engineeringPromptPayload(question, packet);
    expect(prompt.engineeringBrief.subjectTraceabilityRelationships).toHaveLength(0);
    expect(prompt.engineeringBrief.subjectTraceabilityNarratives).toHaveLength(0);
    expect(prompt.engineeringBrief.crossSystemParticipationSummary).toBe(connectivityNarrative);
    expect(JSON.stringify(prompt).split(connectivityNarrative).length - 1).toBe(1);
    expect(prompt.investigationSummary.crossSystemParticipationSummary).toBe("");
    expect(prompt.supportingContext).not.toHaveProperty("subjectTraceabilityDiagnostics");
    expect(prompt.supportingContext).not.toHaveProperty("relationships");
    expect(packet.engineeringBrief.subjectApplicationParticipation).toHaveLength(4);
    expect(packet.engineeringBrief.subjectApplicationParticipation.map((item) => item.application)).toEqual([
      "Codebeamer",
      "Windchill",
      "SAP",
      "Configit",
    ]);
    expect(packet.engineeringBrief.subjectApplicationParticipation.map((item) => item.participantCount)).toEqual([
      20,
      20,
      20,
      20,
    ]);
    expect(packet.engineeringBrief.subjectApplicationParticipation.map((item) => Object.keys(item).sort())).toEqual(
      Array.from({ length: 4 }, () => [
        "application",
        "contribution",
        "participantCount",
        "representativeEntity",
        "subjectId",
        "subjectLabel",
      ]),
    );
    expect(packet.engineeringBrief.subjectApplicationParticipation.map((item) =>
      Object.keys(item.representativeEntity ?? {}).sort(),
    )).toEqual(Array.from({ length: 4 }, () => [
      "citationId",
      "displayLabel",
      "entityId",
      "kind",
      "sourceApplication",
    ]));
    expect(packet.engineeringBrief.subjectApplicationParticipation.filter((item) =>
      !item.representativeEntity ||
      item.representativeEntity.sourceApplication !== item.application ||
      !item.representativeEntity.entityId ||
      !item.representativeEntity.displayLabel ||
      !item.representativeEntity.kind ||
      !item.representativeEntity.citationId,
    )).toEqual([]);
    const promptCitationIds = new Set(
      prompt.supportingContext.citations.map((citation) => citation.citationId),
    );
    expect(packet.engineeringBrief.subjectApplicationParticipation.every((item) =>
      item.representativeEntity && promptCitationIds.has(item.representativeEntity.citationId),
    )).toBe(true);
    expect(packet.engineeringBrief.primaryEntities.map((item) => item.source).sort()).toEqual([
      "codebeamer",
      "configit",
      "sap",
      "windchill",
    ]);
    expect(packet.engineeringBrief.majorRelationships).toEqual([]);
    expect(packet.subjectTraceabilityDiagnostics.entityLevelSubjectEdgesIncludedInPrompt).toBe(0);
    expect(connectivityNarrative).not.toMatch(/direct engineering relationship exists/);
  });

  it("preserves one compact subject-connectivity narrative under context-budget compaction", () => {
    const sources = ["windchill", "sap", "configit", "codebeamer"] as const;
    const manyParticipants = Array.from({ length: 80 }, (_, index) => {
      const source = sources[index % sources.length];
      return entity(`${source}:participant:${index}`, source, "record", `${source}-${index}`);
    });
    const value = investigation(manyParticipants);
    value.knowledgeGraph = graphFor(value);
    const packet = buildInvestigationContext(
      snapshot(value),
      "Which applications are involved in this investigation and how are they connected?",
      { maxContextChars: 24_000 },
    );

    expect(packet.subjectTraceabilityDiagnostics.graphSubjectTraceabilityEdgeCount).toBe(manyParticipants.length);
    expect(packet.subjectTraceabilityDiagnostics.entityLevelSubjectEdgesIncludedInPrompt).toBe(0);
    expect(packet.reasoningPackage.subjectTraceabilityNarratives).toHaveLength(0);
    expect(packet.engineeringBrief.subjectApplicationParticipation).toHaveLength(sources.length);
    expect(packet.engineeringBrief.subjectTraceabilityNarratives).toHaveLength(0);
    expect(engineeringPromptPayload(packet.userMessage, packet)
      .engineeringBrief.crossSystemParticipationSummary).toContain("same Steering investigation subject");
  });

  it("enriches compact four-application coverage and preserves legacy representatives", () => {
    const value = investigation(participants);
    value.knowledgeGraph = graphFor(value);
    const question = "Which applications are involved in this investigation and how are they connected?";
    const packet = buildInvestigationContext(snapshot(value), question, { maxContextChars: 22_500 });
    const prompt = engineeringPromptPayload(question, packet);
    const compactParticipation = packet.engineeringBrief.subjectApplicationParticipation;
    const compactByApplication = new Map(compactParticipation.map((item) => [item.application, item]));
    const expectedApplications = ["Codebeamer", "Windchill", "SAP", "Configit"];
    const providerAnswer = {
      answer: "The applications participate in the investigation.",
      claims: [],
      recommendations: [],
      uncertainties: [],
      followUpQuestions: [],
      snapshotRevision: packet.snapshotRevision,
    };
    const compactBrief = {
      ...packet.engineeringBrief,
      primaryEntities: packet.engineeringBrief.primaryEntities.filter((entity) =>
        !["windchill", "sap"].includes(entity.source?.toLocaleLowerCase() ?? ""),
      ),
    };
    const enriched = ensureEngineeringAnswerCoverage(
      providerAnswer,
      compactBrief,
      packet.citations,
      false,
      packet.questionIntent,
      packet,
    ) as typeof providerAnswer & { answer: string; claims: { text: string; citationIds: string[] }[] };

    expect(compactParticipation.map((item) => item.application)).toEqual(expectedApplications);
    expect(compactParticipation.map((item) => item.representativeEntity?.entityId)).toEqual([
      "codebeamer:requirement:1",
      "wc:part:1",
      "sap:material:1",
      "configit:model:1",
    ]);
    expect(prompt.engineeringBrief.subjectTraceabilityRelationships).toHaveLength(0);
    expect(packet.subjectTraceabilityDiagnostics.entityLevelSubjectEdgesIncludedInPrompt).toBe(0);
    expect(compactParticipation.every((item) =>
      item.representativeEntity && packet.citations.some((citation) =>
        citation.citationId === item.representativeEntity?.citationId,
      ),
    )).toBe(true);
    expect(compactParticipation.filter((item) =>
      ["Windchill", "SAP"].includes(item.application),
    ).every((item) => !compactBrief.primaryEntities.some((entity) =>
      entity.entityId === item.representativeEntity?.entityId,
    ))).toBe(true);
    expect(enriched.answer.match(/Applications Present/g)).toHaveLength(1);
    expect(enriched.answer.split(packet.engineeringBrief.crossSystemParticipationSummary).length - 1).toBe(1);
    expect(enriched.answer.split(packet.engineeringBrief.evidenceBoundaryStatement).length - 1).toBe(1);

    for (const application of expectedApplications) {
      const participation = compactByApplication.get(application)!;
      const representative = participation.representativeEntity!;
      expect(enriched.answer).toContain(representative.displayLabel);
      expect(enriched.claims).toContainEqual(expect.objectContaining({
        text: expect.stringContaining(`${application} contributes`),
        citationIds: expect.arrayContaining([representative.citationId]),
      }));
    }

    expect(() => ensureEngineeringAnswerCoverage(
      providerAnswer,
      {
        ...compactBrief,
        subjectApplicationParticipation: compactParticipation.filter((item) => item.application !== "SAP"),
      },
      packet.citations,
      false,
      packet.questionIntent,
      packet,
    )).toThrow(/SAP/);
    expect(() => ensureEngineeringAnswerCoverage(
      providerAnswer,
      {
        ...compactBrief,
        subjectApplicationParticipation: compactParticipation.map((item) =>
          item.application === "SAP" ? { ...item, representativeEntity: undefined } : item,
        ),
      },
      packet.citations,
      false,
      packet.questionIntent,
      packet,
    )).toThrow(/missing a representative for SAP/i);

    const legacyParticipations = compactParticipation.map((item) => ({
      subjectLabel: item.subjectLabel,
      application: item.application,
      participantCount: item.participantCount,
      representativeEntityIds: item.representativeEntity ? [item.representativeEntity.entityId] : [],
      representativeEntityLabels: item.representativeEntity ? [item.representativeEntity.displayLabel] : [],
      representativeEntityKinds: item.representativeEntity ? [item.representativeEntity.kind] : [],
      contribution: item.contribution,
    }));
    const legacyEnriched = ensureEngineeringAnswerCoverage(
      providerAnswer,
      { ...packet.engineeringBrief, subjectApplicationParticipation: legacyParticipations },
      packet.citations,
      false,
      packet.questionIntent,
      packet,
    ) as typeof providerAnswer & { answer: string; claims: { citationIds: string[] }[] };

    for (const application of expectedApplications) {
      const legacyParticipation = legacyParticipations.find((item) => item.application === application)!;
      const representativeId = legacyParticipation.representativeEntityIds[0];
      const representative = packet.engineeringBrief.primaryEntities.find((item) => item.entityId === representativeId)!;
      expect(legacyEnriched.answer).toContain(legacyParticipation.representativeEntityLabels[0]);
      expect(legacyEnriched.claims).toContainEqual(expect.objectContaining({
        citationIds: expect.arrayContaining([representative.citationId]),
      }));
    }
  });

  it.each([
    ["What operational consequence follows from this Windchill part being represented as a SAP material?", "impact"],
    ["What changes if this Windchill part changes?", "change-analysis"],
  ] as const)("does not use subject edges for impact-like questions: %s", (question, intent) => {
    const value = investigation(participants);
    value.knowledgeGraph = graphFor(value);
    const packet = buildInvestigationContext(snapshot(value), question);

    expect(packet.questionIntent).toBe(intent);
    expect(packet.relationships.some((item) => item.category === "subject-traceability")).toBe(false);
    expect(packet.impactPaths.every((path) => path.impactEligible)).toBe(true);
    expect(packet.impactPaths.every((path) =>
      path.relationshipIds.every((id) => !value.knowledgeGraph!.subjectTraceabilityRelationships.some((edge) => edge.id === id)),
    )).toBe(true);
    expect(packet.reasoningPackage.impactChains.every((chain) =>
      chain.relationshipIds.every((id) => !value.knowledgeGraph!.subjectTraceabilityRelationships.some((edge) => edge.id === id)),
    )).toBe(true);
    expect(packet.reasoningPackage.subjectTraceabilityRelationships).toEqual([]);
    expect(packet.reasoningPackage.subjectTraceabilityNarratives).toEqual([]);
    expect(packet.engineeringBrief.subjectTraceabilityNarratives).toEqual([]);
  });

  it("uses stable subject and edge IDs and preserves participants without an application", () => {
    const participantWithoutApplication = entity("unknown:record:1", undefined, "record", "REC-1");
    const value = investigation([participantWithoutApplication]);
    const first = graphFor(value);
    const second = graphFor(value);

    expect(first.entities.find((item) => item.kind === "investigation-subject")?.id)
      .toBe(second.entities.find((item) => item.kind === "investigation-subject")?.id);
    expect(first.subjectTraceabilityRelationships[0].id).toBe(second.subjectTraceabilityRelationships[0].id);
    expect(first.subjectTraceabilityRelationships[0]).toMatchObject({
      sourceEntityId: participantWithoutApplication.id,
      sourceNativeId: "REC-1",
      impactEligible: false,
    });
    expect(first.subjectTraceabilityRelationships[0].sourceApplication).toBeUndefined();
  });

  it("does not materialize participant edges for an empty investigation", () => {
    const graph = graphFor(investigation([]));

    expect(graph.subjectTraceabilityRelationships).toEqual([]);
    expect(graph.entities.some((item) => item.kind === "investigation-subject")).toBe(true);
  });
});
