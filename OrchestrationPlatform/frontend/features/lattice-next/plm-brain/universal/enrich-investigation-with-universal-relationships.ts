import type { EngineeringIntelligenceInvestigationV1, EngineeringProvenance, IntelligenceRelationship } from "../../contracts/intelligence-v1";
import { resolveUniversalRelationships } from "./engine/universal-relationship-engine";
import type { UniversalRelationshipEvidence } from "./contracts/universal-relationship";

type IntelligenceSource = NonNullable<EngineeringProvenance["source"]>;
const intelligenceSource = (source: string): IntelligenceSource => source as IntelligenceSource;

export function enrichInvestigationWithUniversalRelationships(
  input: EngineeringIntelligenceInvestigationV1,
  evaluatedAt = new Date().toISOString(),
): EngineeringIntelligenceInvestigationV1 {
  const resolution = resolveUniversalRelationships(input.entities, evaluatedAt);
  const evidenceById = new Map(resolution.evidence.map((item) => [item.id, item]));
  const universalRelationships: IntelligenceRelationship[] = resolution.relationships.map((item) => ({
    id: item.id,
    kind: item.type,
    family: "plm-brain-universal",
    sourceEntityId: item.sourceEntityId,
    targetEntityId: item.targetEntityId,
    assertion: "fact",
    confidence: "verified",
    evidenceIds: [item.evidenceId],
    properties: {
      ruleId: { type: "text", text: item.ruleId },
      status: { type: "text", text: item.status },
      evidenceMechanism: { type: "text", text: evidenceById.get(item.evidenceId)?.mechanism ?? "" },
      ...(item.approvalBasis ? { approvalBasis: { type: "text", text: item.approvalBasis } } : {}),
    },
    provenance: {
      source: intelligenceSource(evidenceById.get(item.evidenceId)!.source.application),
      provider: "lattice-plm-brain-universal",
      artifactReference: item.ruleId,
      observedAt: evaluatedAt,
      authority: "backend-derived",
    },
    temporal: { ...input.temporal, assembledAt: evaluatedAt },
  }));
  const evidenceRecords = resolution.evidence.map((item) => ({
    id: item.id,
    kind: "universal-relationship-evidence",
    summary: `${item.ruleId}: ${item.reason}`,
    source: "plm-brain",
    provenance: {
      source: intelligenceSource(item.source.application),
      provider: "lattice-plm-brain-universal",
      nativeId: item.source.entityId,
      artifactReference: item.ruleId,
      observedAt: item.evaluatedAt,
      authority: "backend-derived" as const,
    },
    temporal: { ...input.temporal, assembledAt: evaluatedAt },
  }));
  const allEvidence = [...input.evidence, ...evidenceRecords];
  const allRelationships = [...input.relationships, ...universalRelationships];
  const universalRelationshipEvidence: UniversalRelationshipEvidence[] = [
    ...(input.universalRelationshipEvidence ?? []),
    ...resolution.evidence,
  ];
  const uniqueEvidence = [...new Map(allEvidence.map((item) => [item.id, item])).values()];
  const uniqueRelationships = [...new Map(allRelationships.map((item) => [item.id, item])).values()];

  return {
    ...input,
    relationships: uniqueRelationships,
    evidence: uniqueEvidence,
    universalRelationshipEvidence: [...new Map(universalRelationshipEvidence.map((item) => [item.id, item])).values()],
    universalRelationshipEvaluations: resolution.evaluations,
    universalRelationshipDiagnostics: {
      schemaVersion: "1.0",
      evaluatedAt,
      confirmedCount: resolution.relationships.length,
      unresolved: resolution.unresolved,
    },
    summary: {
      ...input.summary,
      relationshipCount: uniqueRelationships.length,
      evidenceCount: uniqueEvidence.length,
    },
  };
}