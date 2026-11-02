import { describe, expect, it } from "vitest";
import { asInvestigationId } from "../kernel/contracts/investigation-identity";
import type { InvestigationSnapshot } from "../kernel/contracts/investigation-snapshot";
import type { EngineeringIntelligenceInvestigationV1, IntelligenceEntity } from "../contracts/intelligence-v1";
import type {
  CopilotCitation,
  CopilotContextPacket,
  CopilotEntityContext,
  CopilotRelationshipContext,
  EngineeringImpactChain,
  InvestigationReasoningSummary,
  ReasoningNarrative,
  ReasoningPackage,
  RelationshipFlowDiagnostics,
} from "../copilot/contracts";
import {
  buildEngineeringBrief,
  buildInvestigationContext,
  engineeringPromptPayload,
  ensureEngineeringAnswerCoverage,
} from "../copilot/context-builder";
import { validateCopilotAnswer } from "../copilot/answer-validator";

const entity: CopilotEntityContext & { importance: ReasoningPackage["primaryEntities"][number]["importance"] } = {
  entityId: "windchill:part:100",
  citationId: "cite:entity:windchill-part-100",
  displayName: "Part 100",
  kind: "part",
  importanceScore: 0.9,
  identityQuality: "native",
  source: "windchill",
  nativeId: "WT-100",
  properties: { accountingGroup: "restricted-to-explicit-attribute-questions" },
  freshness: "current",
  importance: {
    score: 0.9,
    evidenceCount: 1,
    relationshipCount: 1,
    impactCount: 1,
    crossApplicationCount: 1,
    ontologyStrength: 1,
  },
};

const relationship: CopilotRelationshipContext = {
  relationshipId: "relationship:part-material",
  citationId: "cite:relationship:part-material",
  kind: "operationally-represented-as",
  family: "part-to-material",
  sourceEntityId: entity.entityId,
  sourceCitationId: entity.citationId,
  sourceNativeId: entity.nativeId,
  targetEntityId: "sap:material:200",
  targetCitationId: "cite:entity:sap-material-200",
  targetNativeId: "MAT-200",
  evidenceCitationIds: ["cite:evidence:part-material"],
  semanticGuidanceAvailable: true,
  identitySupported: true,
  status: "CONFIRMED",
  strength: "STRONG",
  provenance: { provider: "ontology", authority: "source-authoritative", ontologyVersion: "1.0" },
  summary: "Part 100 (windchill:WT-100) operationally represents SAP Material 200 (sap:MAT-200).",
};

const relationshipNarrative: ReasoningNarrative = {
  id: "relationship:path-1",
  text: "Part 100 is operationally represented as SAP Material 200. This connects engineering definition to operational execution.",
  engineeringMeaning: "The link provides cross-system traceability.",
  score: 0.95,
  entityIds: [entity.entityId, relationship.targetEntityId],
  relationshipIds: [relationship.relationshipId],
  citationIds: [relationship.citationId, entity.citationId, relationship.targetCitationId, ...relationship.evidenceCitationIds],
};

const impactNarrative: ReasoningNarrative = {
  id: "impact:path-1",
  text: "A change to Part 100 may require evaluation of SAP Material 200. This is potential impact, not proof of causation.",
  engineeringMeaning: "Review downstream operational use.",
  impactRationale: "Potential impact only.",
  score: 0.9,
  entityIds: [entity.entityId, relationship.targetEntityId],
  relationshipIds: [relationship.relationshipId],
  citationIds: relationshipNarrative.citationIds,
};

const impactChain: EngineeringImpactChain = {
  id: "impact-chain:path-1",
  sourceEntityId: entity.entityId,
  impactedEntityId: relationship.targetEntityId,
  relationshipIds: [relationship.relationshipId],
  relationshipSequence: [{
    relationshipId: relationship.relationshipId,
    fromEntityId: entity.entityId,
    toEntityId: relationship.targetEntityId,
    traversal: "forward",
    type: "operationally-represented-as",
    meaning: "is operationally represented as",
  }],
  supportingEvidence: relationship.evidenceCitationIds,
  citationIds: relationshipNarrative.citationIds,
  engineeringExplanation: impactNarrative.text,
  confidence: 0.9,
  impactRationale: "Potential downstream operational review.",
  pathScore: 0.9,
};

const summary: InvestigationReasoningSummary = {
  crossSystemSummary: "Windchill and SAP are connected by a governed relationship.",
  relationshipCount: 1,
  relationshipSummary: relationshipNarrative.text,
  applicationCoverage: { windchill: 1, sap: 1 },
  keyDependencies: [],
  mostConnectedEntities: [entity.displayName],
  highestValueRelationships: [relationshipNarrative.text],
  strongestEvidence: ["Part-to-material mapping evidence."],
  strongestImpactChains: [impactNarrative.text],
};

const reasoningPackage: ReasoningPackage = {
  entityImportance: { [entity.entityId]: entity.importance },
  primaryEntities: [entity],
  keyDependencies: [],
  impactChains: [impactChain],
  strongestEvidence: [{
    evidenceId: "part-material",
    citationId: "cite:evidence:part-material",
    kind: "property-match",
    summary: "Part-to-material mapping evidence.",
    source: "windchill",
    freshness: "current",
  }],
  engineeringFindings: [],
  relationshipNarratives: [relationshipNarrative],
  impactNarratives: [impactNarrative],
  unresolvedRelationships: [],
  missingEvidence: [],
  investigationSummary: summary,
};

const flow: Omit<RelationshipFlowDiagnostics, "copilotContext" | "engineeringBrief"> = {
  ontologyGraph: {
    relationshipCount: 1,
    impactPathCount: 1,
    impactChainCount: 1,
    unresolvedRelationshipCount: 0,
    evidenceCount: 1,
    relationshipDefinitionCount: 1,
  },
  reasoningPackage: {
    relationshipCount: 1,
    impactPathCount: 1,
    impactChainCount: 1,
    unresolvedRelationshipCount: 0,
    evidenceCount: 1,
  },
};

const brief = buildEngineeringBrief(reasoningPackage, [relationship], [entity], flow, reasoningPackage.strongestEvidence);

const citations: CopilotCitation[] = [
  { citationId: entity.citationId, kind: "entity", label: entity.displayName },
  { citationId: relationship.targetCitationId, kind: "entity", label: "SAP Material 200" },
  { citationId: relationship.citationId, kind: "relationship", label: relationship.kind },
  { citationId: relationship.evidenceCitationIds[0], kind: "evidence", label: "property-match" },
];

const contextPacket: CopilotContextPacket = {
  schemaVersion: "1.0",
  investigationId: asInvestigationId("relationship-flow-test"),
  snapshotRevision: 1,
  lifecycle: "ready",
  subject: "Part 100",
  userMessage: "What are the primary entities present in this investigation?",
  questionIntent: "summary",
  entityCandidates: [],
  selectedEntityIds: [],
  entityConfidence: 0,
  retrievalConfidence: {
    score: 1,
    threshold: 0.45,
    belowThreshold: false,
    components: { evidenceSupport: 1, relationshipSupport: 1, retrievalCoverage: 1, groundingAvailability: 1 },
    method: "heuristic",
  },
  ambiguity: { detected: false, clarificationRequired: false },
  relationshipPaths: [],
  impactPaths: [],
  relationshipDefinitions: [],
  impactSummary: {
    classification: "potential",
    pathCount: 1,
    impactedEntityIds: [relationship.targetEntityId],
    entitiesByKind: { material: 1 },
    entitiesByApplication: { sap: 1 },
  },
  reasoningPackage,
  engineeringBrief: brief,
  relationshipFlow: {
    ...flow,
    engineeringBrief: brief.relationshipFlow.engineeringBrief,
    copilotContext: {
      relationshipCount: 1,
      impactPathCount: 1,
      impactChainCount: 1,
      unresolvedRelationshipCount: 0,
      evidenceCount: 1,
    },
  },
  sourceSelections: [],
  entities: [entity],
  relationships: [relationship],
  relationshipGuidance: [],
  findings: [],
  unresolvedEvaluations: [],
  evidence: [],
  evidenceGroups: { direct: [], relationship: [], dependency: [], impact: [] },
  conflicts: [],
  citations,
  uncertainties: [],
  grounding: { hasCanonicalEvidence: true, partialSources: [], staleSources: [], unsupportedIdentifiers: [] },
  omissions: { categories: [], omittedCounts: {}, maxContextChars: 24_000 },
};

const timestamp = "2026-10-30T00:00:00.000Z";
const provenance = (source: "windchill" | "sap" | "configit") => ({
  source,
  provider: `${source}-fixture`,
  observedAt: timestamp,
  authority: "source-authoritative" as const,
});
const temporal = { capturedAt: timestamp, assembledAt: timestamp, freshness: "current" as const };
const rawEntities: IntelligenceEntity[] = [
  { id: "wc:part", kind: "part", displayName: "Part", identityQuality: "native", assertion: "fact", properties: {}, provenance: { ...provenance("windchill"), nativeId: "WT-100" }, temporal },
  { id: "sap:material", kind: "material", displayName: "Material", identityQuality: "native", assertion: "fact", properties: {}, provenance: provenance("sap"), temporal },
  { id: "cfg:model", kind: "model", displayName: "Model", identityQuality: "native", assertion: "fact", properties: {}, provenance: { ...provenance("configit"), nativeId: "CFG-100" }, temporal },
  { id: "wc:requirement", kind: "requirement", displayName: "Requirement", identityQuality: "native", assertion: "fact", properties: {}, provenance: { ...provenance("windchill"), nativeId: "REQ-200" }, temporal },
];
const rawRelationship = (id: string, sourceEntityId: string, targetEntityId: string, source: "windchill" | "sap" | "configit") => ({
  id,
  kind: "governed-link",
  family: "fixture-link",
  sourceEntityId,
  targetEntityId,
  assertion: "fact" as const,
  evidenceIds: [],
  properties: {},
  provenance: provenance(source),
  temporal,
});
const canonicalSummary: EngineeringIntelligenceInvestigationV1 = {
  contractVersion: "1.0",
  investigationId: "summary-relationship-fixture",
  subject: {
    id: "subject",
    displayName: "Summary relationship fixture",
    candidateIds: rawEntities.map((item) => item.id),
    confidence: "verified",
    reasons: ["test fixture"],
    provenance: provenance("windchill"),
    temporal,
  },
  entities: rawEntities,
  relationships: [
    rawRelationship("link:part-material", "wc:part", "sap:material", "windchill"),
    rawRelationship("link:model-requirement", "cfg:model", "wc:requirement", "configit"),
  ],
  evidence: [],
  findings: [],
  sources: [],
  identityClusters: [],
  temporal,
  summary: { entityCount: rawEntities.length, relationshipCount: 2, evidenceCount: 0, findingCount: 0, availableSourceCount: 0, partialSourceCount: 0, status: "success" },
};
const summarySnapshot: InvestigationSnapshot = {
  identity: { investigationId: asInvestigationId(canonicalSummary.investigationId), revision: 1, executionEpoch: 0 },
  lifecycle: "ready",
  subjectLabel: "Summary relationship fixture",
  query: "",
  selections: [],
  executions: {},
  acceptedEvidenceIds: [],
  completeness: { overall: "complete", requestedSources: [], successfulSources: [], partialSources: [], failedSources: [], pendingSources: [], limitations: [] },
  canonical: { revision: 1, publishedAt: timestamp, value: canonicalSummary },
  warnings: [],
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe("Copilot relationship flow", () => {
  it("keeps a general summary investigation-wide across disconnected relationships", () => {
    const packet = buildInvestigationContext(
      summarySnapshot,
      "What are the primary entities present in this investigation?",
    );

    expect(packet.selectedEntityIds).toHaveLength(3);
    expect(packet.relationships).toHaveLength(2);
    expect(packet.engineeringBrief.majorRelationships).toHaveLength(2);
    expect(packet.relationshipFlow.reasoningPackage.relationshipCount).toBe(2);
    expect(packet.relationshipFlow.copilotContext.relationshipCount).toBe(2);
    expect(new Set(packet.selectedEntityIds)).toEqual(new Set(["wc:part", "sap:material", "wc:requirement"]));
  });

  it("uses metadata only as a fallback and ranks engineering relationships first", () => {
    const metadataRelationship: CopilotRelationshipContext = {
      ...relationship,
      relationshipId: "relationship:metadata",
      citationId: "cite:relationship:metadata",
      kind: "contains",
      family: "metadata",
      evidenceCitationIds: [],
      summary: "Part 100 contains catalog metadata.",
    };
    const rankedBrief = buildEngineeringBrief(
      reasoningPackage,
      [metadataRelationship, relationship],
      [entity],
      flow,
      reasoningPackage.strongestEvidence,
    );

    expect(rankedBrief.majorRelationships[0].relationshipId).toBe(relationship.relationshipId);
    expect(rankedBrief.primaryEntities[0].kind).toBe("part");
  });

  it("keeps application-connection questions investigation-scoped", () => {
    const packet = buildInvestigationContext(
      summarySnapshot,
      "Which applications are involved in this investigation and how are they connected?",
    );

    expect(packet.questionIntent).toBe("relationship");
    expect(packet.ambiguity.clarificationRequired).toBe(false);
    expect(packet.selectedEntityIds).toEqual([]);
    expect(packet.relationships).toHaveLength(2);
    expect(packet.relationshipFlow.copilotContext.relationshipCount).toBe(2);
  });

  it("materializes cross-source identity membership as traceability", () => {
    const crossSourceCanonical = {
      ...canonicalSummary,
      subject: {
        ...canonicalSummary.subject,
        candidateIds: ["wc:part", "sap:material"],
      },
      identityClusters: [{
        id: "projection:domain:cross-source",
        preferredEntityId: "wc:part",
        entityIds: ["wc:part", "sap:material"],
        confidence: "verified",
        reasons: ["same investigation subject"],
        evidenceIds: [],
      }],
    };
    const packet = buildInvestigationContext({
      ...summarySnapshot,
      canonical: {
        ...summarySnapshot.canonical!,
        value: crossSourceCanonical,
      },
    }, "Which applications are involved in this investigation and how are they connected?");

    expect(packet.relationships.some((item) =>
      item.family === "projection:domain:cross-source" &&
      item.sourceEntityId === "wc:part" &&
      item.targetEntityId === "sap:material",
    )).toBe(true);
    expect(packet.relationships.some((item) => item.sourceEntityId === "wc:part" && item.targetEntityId === "sap:material")).toBe(true);
  });

  it("retains relationship and impact artifacts in the brief, prompt, and validated answer", () => {
    expect(brief.primaryEntities.map((item) => item.displayName)).toContain("Part 100");
    expect(brief.majorRelationships.map((item) => item.relationshipId)).toContain(relationship.relationshipId);
    expect(brief.relationshipNarratives).toContain(relationshipNarrative);
    expect(brief.impactNarratives).toContain(impactNarrative);
    expect(brief.relationshipEvidence).toContain(reasoningPackage.strongestEvidence[0]);
    expect(brief.topImpactChains).toContain(impactChain);

    const payload = engineeringPromptPayload(contextPacket.userMessage, contextPacket);
    const serializedPayload = JSON.stringify(payload);
    expect(serializedPayload).toContain(relationshipNarrative.text);
    expect(serializedPayload).toContain(impactNarrative.text);
    expect(serializedPayload).toContain("relationshipEvidence");
    expect(serializedPayload).not.toContain("restricted-to-explicit-attribute-questions");
    expect(payload.engineeringBrief.relationshipFlow).toMatchObject({
      ontologyGraph: { relationshipCount: 1, impactPathCount: 1, impactChainCount: 1, unresolvedRelationshipCount: 0, evidenceCount: 1 },
      reasoningPackage: { relationshipCount: 1, impactPathCount: 1, impactChainCount: 1, unresolvedRelationshipCount: 0, evidenceCount: 1 },
      engineeringBrief: { relationshipCount: 1, impactPathCount: 1, impactChainCount: 1, unresolvedRelationshipCount: 0, evidenceCount: 1 },
      copilotContext: { relationshipCount: 1, impactPathCount: 1, impactChainCount: 1, unresolvedRelationshipCount: 0, evidenceCount: 1 },
      promptPayload: { relationshipCount: 1, impactPathCount: 1, impactChainCount: 1, unresolvedRelationshipCount: 0, evidenceCount: 1 },
    });

    const supplemented = ensureEngineeringAnswerCoverage(
      { answer: "The investigation includes Part 100.", claims: [], recommendations: [], uncertainties: [], followUpQuestions: [], snapshotRevision: 1 },
      brief,
      citations,
      true,
    );
    const validated = validateCopilotAnswer(supplemented, contextPacket);
    expect(validated.answer).toContain(relationshipNarrative.text);
    expect(validated.answer).toContain(impactNarrative.text);
    expect(validated.answer).toContain("Primary entities");
    expect(validated.answer).toContain("Relationship provenance and evidence");
    expect(validated.answer).toContain("authority source-authoritative");
    expect(validated.answer).toContain("Part-to-material mapping evidence.");
    expect(validated.claims.some((claim) => claim.citationIds.includes(relationship.citationId))).toBe(true);
    expect(validated.citations?.some((citation) => citation.citationId === relationship.citationId)).toBe(true);
  });
});
