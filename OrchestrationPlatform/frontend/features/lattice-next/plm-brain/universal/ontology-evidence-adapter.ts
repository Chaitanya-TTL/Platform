import type { EngineeringIntelligenceInvestigationV1 } from "../../contracts/intelligence-v1";
import type {
  OntologyEvidenceObservation,
  OntologyRelationshipDefinition,
  OntologyEvidenceRule,
} from "../contracts/relationship-ontology";

export interface GovernedOntologyEvidenceMatch {
  sourceEntityId: string;
  targetEntityId: string;
  rule: OntologyEvidenceRule;
  sourceValue: string;
  targetValue: string;
  observations: OntologyEvidenceObservation[];
}

function readPath(
  entity: EngineeringIntelligenceInvestigationV1["entities"][number],
  path: string,
): string | undefined {
  if (path === "provenance.nativeId") return entity.provenance.nativeId;
  const propertyPath = path.startsWith("properties.") ? path.slice("properties.".length) : path;
  const property = entity.properties[propertyPath];
  const value = property?.text ?? property?.reference ?? property?.number;
  return value === undefined ? undefined : String(value).trim();
}

function isVerifiedMappingBasis(
  basis: string,
): basis is "domain-owner-confirmed" | "source-explicit" | "integration-contract" {
  return basis === "domain-owner-confirmed" ||
    basis === "source-explicit" ||
    basis === "integration-contract";
}

export function adaptGovernedOntologyEvidence(
  canonical: EngineeringIntelligenceInvestigationV1,
  definition: OntologyRelationshipDefinition,
): GovernedOntologyEvidenceMatch[] {
  const plmBrain = canonical.plmBrain;
  if (!plmBrain) return [];

  const ontologyRule = definition.evidenceRules.find((rule) =>
    rule.mechanism === "governed-mapping" &&
    rule.operator === "exact-scalar" &&
    rule.sourcePath === "plmBrain.mappingId" &&
    rule.targetPath === "plmBrain.mappingId",
  );
  if (!ontologyRule) return [];

  const entitiesById = new Map(canonical.entities.map((entity) => [entity.id, entity]));
  const evidenceById = new Map(plmBrain.evidence.map((evidence) => [evidence.evidenceId, evidence]));
  const matches: GovernedOntologyEvidenceMatch[] = [];

  for (const relationship of plmBrain.relationships) {
    if (relationship.type !== definition.forward.type) continue;
    if (relationship.status !== "confirmed" || relationship.strength !== "strong") continue;

    const handshake = evidenceById.get(relationship.evidenceId);
    const source = entitiesById.get(relationship.sourceEntityId);
    const target = entitiesById.get(relationship.targetEntityId);
    if (!handshake || !source || !target) continue;
    if (handshake.mappingId !== relationship.mappingId || !handshake.mappingId.trim()) continue;
    if (handshake.source.entityId !== source.id || handshake.target.entityId !== target.id) continue;
    if (!handshake.mappingReference.trim() || !handshake.verifiedBy.trim() || !handshake.verifiedAt.trim()) continue;
    if (!isVerifiedMappingBasis(handshake.mappingBasis)) continue;
    if (!relationship.evidenceId || !handshake.evidenceId) continue;
    if (!definition.sourceApplications.includes(source.provenance.source ?? "")) continue;
    if (!definition.targetApplications.includes(target.provenance.source ?? "")) continue;
    if (!source.provenance.source || !target.provenance.source) continue;
    if (handshake.source.application !== source.provenance.source || handshake.target.application !== target.provenance.source) continue;
    const sourceValue = readPath(source, handshake.source.attributePath);
    const targetValue = readPath(target, handshake.target.attributePath);
    if (sourceValue !== handshake.source.value || targetValue !== handshake.target.value) continue;

    const mappingValue = handshake.mappingId;
    const observationBase = {
      mappingId: handshake.mappingId,
      mappingReference: handshake.mappingReference,
      mappingBasis: handshake.mappingBasis,
      handshakeEvidenceId: handshake.evidenceId,
      ontologyRuleId: ontologyRule.id,
      ontologyFieldPath: ontologyRule.sourcePath,
      ontologyFieldValue: mappingValue,
    };
    const sourceObservationId = `governed-ontology:${encodeURIComponent(handshake.evidenceId)}:source`;
    const targetObservationId = `governed-ontology:${encodeURIComponent(handshake.evidenceId)}:target`;
    const observations: OntologyEvidenceObservation[] = [
      {
        id: sourceObservationId,
        citationId: `cite:evidence:${encodeURIComponent(sourceObservationId)}`,
        application: handshake.source.application,
        entityId: handshake.source.entityId,
        path: handshake.source.attributePath,
        value: handshake.source.value,
        provider: handshake.source.sourceProvider,
        observedAt: handshake.source.observedAt,
        authority: handshake.mappingBasis,
        ...observationBase,
        ontologyFieldPath: ontologyRule.sourcePath,
      },
      {
        id: targetObservationId,
        citationId: `cite:evidence:${encodeURIComponent(targetObservationId)}`,
        application: handshake.target.application,
        entityId: handshake.target.entityId,
        path: handshake.target.attributePath,
        value: handshake.target.value,
        provider: handshake.target.sourceProvider,
        observedAt: handshake.target.observedAt,
        authority: handshake.mappingBasis,
        ...observationBase,
        ontologyFieldPath: ontologyRule.targetPath,
      },
    ];

    matches.push({
      sourceEntityId: relationship.sourceEntityId,
      targetEntityId: relationship.targetEntityId,
      rule: ontologyRule,
      sourceValue: mappingValue,
      targetValue: mappingValue,
      observations,
    });
  }

  return matches.sort((left, right) =>
    left.sourceEntityId.localeCompare(right.sourceEntityId) ||
    left.targetEntityId.localeCompare(right.targetEntityId),
  );
}
