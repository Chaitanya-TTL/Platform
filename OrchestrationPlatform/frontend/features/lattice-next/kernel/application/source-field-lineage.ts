import { createHash } from "node:crypto";
import type {
  EngineeringIntelligenceInvestigationV1,
  EngineeringProvenance,
  IntelligenceEntity,
  IntelligenceProperty,
  IntelligenceSourceFieldMetadata,
} from "../../contracts/intelligence-v1";

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

function stableDigest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function sourceFieldEvidenceRecordId(
  investigationId: string,
  entityId: string,
  fieldKey: string,
  provenance: EngineeringProvenance,
  candidateId?: string,
): string {
  const identity = [
    investigationId,
    provenance.source ?? "",
    provenance.nativeId ?? "",
    provenance.nativeRevision ?? "",
    `entities/${entityId}/${fieldKey}`,
    candidateId ?? "",
  ];
  return `source-evidence:${stableDigest(JSON.stringify(identity))}`;
}

function propertyValue(property: IntelligenceProperty): unknown {
  if (hasOwn(property, "sourceValue")) return property.sourceValue;
  if (property.text !== undefined) return property.text;
  if (property.number !== undefined) return property.number;
  if (property.boolean !== undefined) return property.boolean;
  if (property.timestamp !== undefined) return property.timestamp;
  if (property.items !== undefined) return property.items;
  if (property.reference !== undefined) return property.reference;
  return undefined;
}

function textProperty(
  properties: IntelligenceEntity["properties"],
  key: string,
): string | undefined {
  const property = properties[key];
  if (property?.type === "text" && property.text?.trim()) return property.text;
  if (property?.reference?.trim()) return property.reference;
  return undefined;
}

function sourceProvenance(
  entity: IntelligenceEntity,
  entities: readonly IntelligenceEntity[],
): EngineeringProvenance {
  const provenance = entity.provenance;
  if (provenance.nativeId?.trim()) {
    return {
      ...provenance,
      artifactReference: provenance.artifactReference ?? entity.id,
    };
  }

  const ownerId = textProperty(entity.properties, "ownerRequirementId");
  const owner = ownerId
    ? entities.find((candidate) =>
        candidate.id === ownerId ||
        (candidate.provenance.source === provenance.source &&
          candidate.provenance.nativeId === ownerId))
    : undefined;
  if (!owner || owner.provenance.source !== provenance.source || !owner.provenance.nativeId) {
    return { ...provenance, artifactReference: provenance.artifactReference ?? entity.id };
  }

  return {
    ...provenance,
    nativeId: owner.provenance.nativeId,
    nativeRevision: provenance.nativeRevision ?? owner.provenance.nativeRevision,
    sourceExecutionId: provenance.sourceExecutionId ?? owner.provenance.sourceExecutionId,
    artifactReference: provenance.artifactReference ?? entity.id,
  };
}

function inferredFieldName(
  propertyKey: string,
  property: IntelligenceProperty,
  properties: IntelligenceEntity["properties"],
): string {
  if (property.sourceFieldName?.trim()) return property.sourceFieldName;
  if (propertyKey === "value") {
    return textProperty(properties, "fieldKey") ??
      textProperty(properties, "attributeKey") ??
      textProperty(properties, "attribute") ??
      propertyKey;
  }
  return propertyKey;
}

function withCitation(
  candidate: IntelligenceSourceFieldMetadata,
  investigationId: string,
  entity: IntelligenceEntity,
  metadataKey: string,
): IntelligenceSourceFieldMetadata {
  const provenance = candidate.sourceProvenance;
  if (candidate.sourceAuthority !== "source-authoritative" ||
      provenance?.authority !== "source-authoritative" ||
      !provenance.source ||
      !provenance.nativeId?.trim()) return candidate;

  const recordId = sourceFieldEvidenceRecordId(
    investigationId,
    entity.id,
    `sourceFieldMetadata/${metadataKey}`,
    provenance,
    candidate.candidateId,
  );
  if (candidate.citationIds?.includes(recordId)) return candidate;
  return { ...candidate, citationIds: [...(candidate.citationIds ?? []), recordId] };
}

function sameCandidate(
  candidates: readonly IntelligenceSourceFieldMetadata[],
  sourceFieldName: string,
  sourceValue: unknown,
  provenance: EngineeringProvenance,
): boolean {
  return candidates.some((candidate) =>
    candidate.sourceFieldName === sourceFieldName &&
    JSON.stringify(candidate.sourceValue) === JSON.stringify(sourceValue) &&
    candidate.sourceProvenance?.source === provenance.source &&
    candidate.sourceProvenance?.nativeId === provenance.nativeId &&
    candidate.sourceProvenance?.nativeRevision === provenance.nativeRevision);
}

export function projectSourceFieldLineage(
  investigation: EngineeringIntelligenceInvestigationV1,
  investigationId = investigation.investigationId,
): EngineeringIntelligenceInvestigationV1 {
  const entities = investigation.entities.map((entity) => {
    const resolvedProvenance = sourceProvenance(entity, investigation.entities);
    const metadata: Record<string, IntelligenceSourceFieldMetadata[]> = {};

    for (const [fieldKey, candidates] of Object.entries(entity.sourceFieldMetadata ?? {})) {
      metadata[fieldKey] = candidates.map((candidate, index) => {
        const candidateId = candidate.candidateId ??
          `metadata:${entity.id}:${fieldKey}:${index}`;
        const enriched: IntelligenceSourceFieldMetadata = {
          ...candidate,
          ...(candidateId ? { candidateId } : {}),
        };
        return withCitation(enriched, investigationId, entity, fieldKey);
      });
    }

    for (const [propertyKey, property] of Object.entries(entity.properties)) {
      const sourceValue = propertyValue(property);
      if (sourceValue === undefined) continue;

      const sourceFieldName = inferredFieldName(propertyKey, property, entity.properties);
      const fieldCandidates = metadata[propertyKey] ?? [];
      if (sameCandidate(fieldCandidates, sourceFieldName, sourceValue, resolvedProvenance)) continue;

      const candidateId = property.candidateId ?? `property:${entity.id}:${propertyKey}`;
      const candidate: IntelligenceSourceFieldMetadata = {
        sourceValue,
        sourceFieldName,
        candidateId,
        nativeRecordKind: property.nativeRecordKind ?? entity.kind,
        ...(property.displayValue !== undefined ? { displayValue: property.displayValue } : {}),
        sourceProvenance: {
          ...(property.sourceProvenance ?? resolvedProvenance),
          artifactReference:
            property.sourceProvenance?.artifactReference ??
            resolvedProvenance.artifactReference ??
            entity.id,
        },
        sourceAuthority:
          property.sourceAuthority ??
          property.sourceProvenance?.authority ??
          resolvedProvenance.authority,
        observedAt: property.observedAt ?? resolvedProvenance.observedAt,
        ...(property.extractedAt ? { extractedAt: property.extractedAt } : {}),
        ...(property.capturedAt ?? entity.temporal.capturedAt
          ? { capturedAt: property.capturedAt ?? entity.temporal.capturedAt }
          : {}),
        ...(property.effectiveAt ?? entity.temporal.effectiveAt
          ? { effectiveAt: property.effectiveAt ?? entity.temporal.effectiveAt }
          : {}),
        ...(property.validFrom ?? entity.temporal.validFrom
          ? { validFrom: property.validFrom ?? entity.temporal.validFrom }
          : {}),
        ...(property.validTo ?? entity.temporal.validTo
          ? { validTo: property.validTo ?? entity.temporal.validTo }
          : {}),
        freshness: property.freshness ?? entity.temporal.freshness,
        ...(property.completeness ? { completeness: property.completeness } : {}),
        ...(property.citationIds ? { citationIds: property.citationIds } : {}),
        ...(property.citationLinkageOrigin
          ? { citationLinkageOrigin: property.citationLinkageOrigin }
          : {}),
        ...(property.sourceScope ? { sourceScope: property.sourceScope } : {}),
        ...(property.sourceAdapterMetadata
          ? { sourceAdapterMetadata: property.sourceAdapterMetadata }
          : {}),
        ...(property.sourceTransformations
          ? { sourceTransformations: property.sourceTransformations }
          : {}),
      };
      const enriched = withCitation(candidate, investigationId, entity, propertyKey);
      metadata[propertyKey] = [...fieldCandidates, enriched];
    }

    return {
      ...entity,
      sourceFieldMetadata: metadata,
    };
  });

  return { ...investigation, entities };
}
