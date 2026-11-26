import type {
  EngineeringIntelligenceInvestigationV1,
  IntelligenceEntity,
  IntelligenceSourceFieldMetadata,
} from "../../contracts/intelligence-v1";
import {
  FACTUAL_EVIDENCE_CONTRACT_VERSION,
  type FactAdapterDiagnosticV1,
  type FactAdapterOmissionV1,
  type FactTransformationV1,
  type FactValueTypeV1,
  type GenericFactV1,
  validateGenericFactV1,
} from "../../contracts/factual-evidence-v1";
import {
  CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1,
  resolveCodebeamerRequirementField,
} from "./codebeamer-requirement-field-registry.v1";
import type {
  CanonicalFactAdapterInputV1,
  GenericFactAdapterResultV1,
  GenericFactSourceAdapterV1,
} from "./source-fact-adapter";

type SourceEvidence = EngineeringIntelligenceInvestigationV1["evidence"][number];
type SourceRecord = EngineeringIntelligenceInvestigationV1["sources"][number];
type SourceFieldValue = IntelligenceSourceFieldMetadata & {
  metadataCandidate: boolean;
};

const sourceValueType = (value: unknown): FactValueTypeV1 => {
  if (typeof value === "string") return "text";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "scalar";
  if (Array.isArray(value)) return "list";
  return "structured";
};

const sourceEvidenceFor = (
  investigation: EngineeringIntelligenceInvestigationV1,
  entity: IntelligenceEntity,
): readonly SourceEvidence[] => investigation.evidence.filter((evidence) =>
  evidence.source === CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1.sourceApplication &&
  evidence.provenance.artifactReference === entity.id,
);

const matchingSourceRecord = (
  investigation: EngineeringIntelligenceInvestigationV1,
  entityId: string,
): SourceRecord | undefined => investigation.sources.find((source) =>
  source.entityId === entityId &&
  source.source === CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1.sourceApplication,
);

const completenessFor = (source?: SourceRecord): GenericFactV1["completeness"] =>
  source?.status === "partial" ? "partial" : "unknown";

const nativeIdFor = (entity: IntelligenceEntity): string | undefined => {
  const raw = entity.properties["codebeamer.itemId"]?.sourceValue;
  return typeof raw === "string" || typeof raw === "number" ? String(raw) : undefined;
};

const sourceFieldProperties = (
  entity: IntelligenceEntity,
  diagnostics: FactAdapterDiagnosticV1[],
): ReadonlyMap<string, readonly SourceFieldValue[]> => {
  const fields = new Map<string, SourceFieldValue[]>();
  const addField = (sourceField: SourceFieldValue) => {
    const registryField = resolveCodebeamerRequirementField(sourceField.sourceFieldName);
    if (!registryField) {
      diagnostics.push({
        code: "unmapped-field",
        message: "Source field is not registered for Codebeamer requirement facts.",
        sourceApplication: CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1.sourceApplication,
        sourceEntityId: entity.id,
        sourceFieldName: sourceField.sourceFieldName,
        provenance: sourceField.sourceProvenance,
      });
      return;
    }
    const matches = fields.get(registryField.fieldId) ?? [];
    matches.push(sourceField);
    fields.set(registryField.fieldId, matches);
  };
  for (const metadataValue of Object.values(entity.sourceFieldMetadata ?? {})) {
    for (const metadata of metadataValue) {
      addField({ ...metadata, metadataCandidate: true });
    }
  }
  for (const [propertyKey, property] of Object.entries(entity.properties)) {
    if (!property.sourceFieldName ||
        !Object.prototype.hasOwnProperty.call(property, "sourceValue")) continue;
    const registryField = resolveCodebeamerRequirementField(property.sourceFieldName);
    if (registryField && fields.has(registryField.fieldId)) continue;
    addField({
      sourceValue: property.sourceValue,
      sourceFieldName: property.sourceFieldName,
      sourceTransformations: property.sourceTransformations,
      candidateId: `property:${propertyKey}`,
      sourceProvenance: entity.provenance,
      sourceAuthority: entity.provenance.authority,
      observedAt: entity.provenance.observedAt,
      extractedAt: entity.temporal.assembledAt,
      capturedAt: entity.temporal.capturedAt,
      effectiveAt: entity.temporal.effectiveAt,
      validFrom: entity.temporal.validFrom,
      validTo: entity.temporal.validTo,
      freshness: entity.temporal.freshness,
      metadataCandidate: false,
    });
  }
  return fields;
};

const toFact = (
  investigation: EngineeringIntelligenceInvestigationV1,
  entity: IntelligenceEntity,
  fieldId: string,
  property: SourceFieldValue,
  evidence: readonly SourceEvidence[],
  sourceRecord?: SourceRecord,
): GenericFactV1 | undefined => {
  if (!Object.prototype.hasOwnProperty.call(property, "sourceValue")) {
    return undefined;
  }
  const field = resolveCodebeamerRequirementField(property.sourceFieldName);
  if (!field || field.fieldId !== fieldId) return undefined;

  const requestedCitationIds = property.metadataCandidate
    ? property.citationIds ?? []
    : evidence.map((item) => item.id);
  const citedEvidence = evidence.filter((item) => requestedCitationIds.includes(item.id));
  const citationIds = [...new Set(citedEvidence.map((item) => item.id))];
  const rawNativeId = nativeIdFor(entity);
  const value = property.sourceValue;
  const sourceProvenance = property.sourceProvenance ?? entity.provenance;
  const sourceScope = property.sourceScope;
  const revision = sourceScope?.revision ?? sourceProvenance.nativeRevision;
  const dimensions = revision
    ? [{
        dimensionId: "source-revision",
        label: "Source revision",
        exactValue: revision,
        valueType: "text" as const,
      }]
    : [];
  const transformations = property.sourceTransformations ?? [];
  const displayNormalization = transformations.some((transformation) =>
    transformation.operation === "display-normalization",
  );
  const extractedAt = property.extractedAt;
  const fact: GenericFactV1 = {
    contractVersion: FACTUAL_EVIDENCE_CONTRACT_VERSION,
    factId: [
      "fact",
      encodeURIComponent(investigation.investigationId),
      encodeURIComponent(entity.id),
      encodeURIComponent(field.fieldId),
      encodeURIComponent(property.sourceFieldName),
      encodeURIComponent(property.candidateId ?? property.sourceFieldName),
    ].join(":"),
    investigationId: investigation.investigationId,
    subjectId: investigation.subject.id,
    sourceApplication: CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1.sourceApplication,
    sourceEntityId: entity.id,
    sourceNativeId: rawNativeId,
    canonicalEntityKind: entity.kind,
    nativeRecordKind: "requirement",
    fieldId: field.fieldId,
    sourceFieldName: property.sourceFieldName,
    displayLabel: field.displayLabel,
    factRole: field.factRole,
    exactSourceValue: value,
    sourceValueType: sourceValueType(value),
    valueType: field.valueType,
    ...(displayNormalization && property.displayValue !== undefined
      ? {
          normalizedValue: property.displayValue,
          normalizedValueType: sourceValueType(property.displayValue),
        }
      : {}),
    dimensions,
    observedAt: property.observedAt ?? sourceProvenance.observedAt,
    ...(extractedAt ? { extractedAt } : {}),
    ...(property.capturedAt ? { capturedAt: property.capturedAt } : {}),
    effectiveAt: property.effectiveAt ?? sourceScope?.effectiveAt ?? entity.temporal.effectiveAt,
    validFrom: property.validFrom ?? sourceScope?.validFrom ?? entity.temporal.validFrom,
    validTo: property.validTo ?? sourceScope?.validTo ?? entity.temporal.validTo,
    freshness: property.freshness ?? entity.temporal.freshness,
    completeness: property.completeness ?? completenessFor(sourceRecord),
    derivationStatus: "raw",
    transformationTrace: transformations.map(
      (transformation): FactTransformationV1 => ({
        ruleId: transformation.ruleId,
        ruleVersion: transformation.ruleVersion,
        operation: transformation.operation,
        reversible: transformation.reversible,
      }),
    ),
    citationIds,
    citationEligible: citationIds.length > 0,
    sourceAuthority: property.sourceAuthority ?? sourceProvenance.authority,
    provenance: {
      entity: sourceProvenance,
      evidence: citedEvidence.map((item) => ({ id: item.id, provenance: item.provenance })),
      sourceFieldName: property.sourceFieldName,
      candidateId: property.candidateId,
      sourceScope,
    },
  };
  return fact;
};

const omission = (
  investigation: EngineeringIntelligenceInvestigationV1,
  entity: IntelligenceEntity,
  fieldId: string,
  reasonCode: FactAdapterOmissionV1["reasonCode"],
  reason: string,
  citationIds: readonly string[],
  sourceField?: SourceFieldValue,
): FactAdapterOmissionV1 => ({
  scope: {
    investigationId: investigation.investigationId,
    subjectId: investigation.subject.id,
    sourceApplication: CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1.sourceApplication,
    entityId: entity.id,
    sourceNativeId: sourceField?.sourceProvenance?.nativeId ?? nativeIdFor(entity),
    canonicalEntityKind: entity.kind,
    fieldId,
  },
  sourceEntityId: entity.id,
  sourceNativeId: sourceField?.sourceProvenance?.nativeId ?? nativeIdFor(entity),
  fieldId,
  sourceFieldName: sourceField?.sourceFieldName,
  reasonCode,
  reason,
  citationIds,
  provenance: sourceField?.metadataCandidate
    ? sourceField.sourceProvenance
    : sourceField?.sourceProvenance ?? entity.provenance,
});

function mapCodebeamerRequirementFacts(
  input: CanonicalFactAdapterInputV1,
): GenericFactAdapterResultV1 {
  const { investigation } = input;
  const facts: GenericFactV1[] = [];
  const diagnostics: FactAdapterDiagnosticV1[] = [];
  const omissions: FactAdapterOmissionV1[] = [];
  const eligibleEntities = investigation.entities.filter((entity) =>
    entity.kind === "requirement" &&
    entity.assertion === "fact" &&
    entity.provenance.source === CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1.sourceApplication,
  );

  for (const entity of eligibleEntities) {
    const evidence = sourceEvidenceFor(investigation, entity);
    const sourceRecord = matchingSourceRecord(investigation, entity.id);
    const fields = sourceFieldProperties(entity, diagnostics);
    const hasRegisteredSourceField = fields.size > 0;
    if (!evidence.length && !hasRegisteredSourceField) continue;

    for (const field of CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1.fields) {
      const sourceProperties = fields.get(field.fieldId) ?? [];
      if (!sourceProperties.length) {
        omissions.push(omission(
          investigation,
          entity,
          field.fieldId,
          "source-value-unavailable",
          "No source-backed canonical value was available for this registered field.",
          evidence.map((item) => item.id),
        ));
        continue;
      }

      for (const property of sourceProperties) {
        if (property.metadataCandidate && !property.sourceProvenance) {
          const item = omission(
            investigation,
            entity,
            field.fieldId,
            "missing-provenance",
            "The source candidate did not preserve its own provenance.",
            property.citationIds ?? [],
            property,
          );
          omissions.push(item);
          diagnostics.push({
            code: "missing-provenance",
            message: item.reason,
            sourceApplication: CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1.sourceApplication,
            sourceEntityId: entity.id,
            fieldId: field.fieldId,
            sourceFieldName: property.sourceFieldName,
            citationIds: property.citationIds,
          });
          continue;
        }
        if (property.metadataCandidate && !property.sourceAuthority) {
          const item = omission(
            investigation,
            entity,
            field.fieldId,
            "missing-source-authority",
            "The source candidate did not preserve its own authority.",
            property.citationIds ?? [],
            property,
          );
          omissions.push(item);
          diagnostics.push({
            code: "missing-source-authority",
            message: item.reason,
            sourceApplication: CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1.sourceApplication,
            sourceEntityId: entity.id,
            sourceNativeId: property.sourceProvenance?.nativeId,
            fieldId: field.fieldId,
            sourceFieldName: property.sourceFieldName,
            citationIds: property.citationIds,
            provenance: property.sourceProvenance,
          });
          continue;
        }
        const fact = toFact(
          investigation,
          entity,
          field.fieldId,
          property,
          evidence,
          sourceRecord,
        );
        if (!fact) {
          const item = omission(
            investigation,
            entity,
            field.fieldId,
            "source-value-unavailable",
            "The canonical property did not preserve an exact source value.",
            evidence.map((sourceEvidence) => sourceEvidence.id),
            property,
          );
          omissions.push(item);
          diagnostics.push({
            code: "source-value-unavailable",
            message: item.reason,
            sourceApplication: CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1.sourceApplication,
            sourceEntityId: entity.id,
            fieldId: field.fieldId,
            sourceFieldName: property.sourceFieldName,
            provenance: entity.provenance,
          });
          continue;
        }

        const validation = validateGenericFactV1(fact);
        if (!validation.valid) {
          diagnostics.push(...validation.diagnostics);
          omissions.push(omission(
            investigation,
            entity,
            field.fieldId,
            "unsupported-value-type",
            "The mapped source value did not satisfy the generic fact contract.",
            fact.citationIds,
          ));
          continue;
        }

        facts.push(validation.fact);
        if (!fact.citationEligible) {
          const item = omission(
            investigation,
            entity,
            field.fieldId,
            "missing-citation",
            "Source evidence did not provide an eligible citation reference.",
            [],
          );
          omissions.push(item);
          diagnostics.push({
            code: "missing-citation",
            message: item.reason,
            factId: fact.factId,
            sourceApplication: fact.sourceApplication,
            sourceEntityId: fact.sourceEntityId,
            sourceNativeId: fact.sourceNativeId,
            fieldId: fact.fieldId,
            sourceFieldName: fact.sourceFieldName,
            provenance: fact.provenance,
          });
        }
      }
    }
  }

  const sourceCoverage = investigation.sources
    .filter((source) =>
      source.source === CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1.sourceApplication,
    )
    .map((source) => {
      const evidence = investigation.evidence.filter((item) =>
        item.source === source.source &&
        item.provenance.artifactReference === source.entityId,
      );
      return {
        contractVersion: FACTUAL_EVIDENCE_CONTRACT_VERSION,
        investigationId: investigation.investigationId,
        subjectId: investigation.subject.id,
        sourceApplication: source.source,
        sourceEntityId: source.entityId,
        status: source.status,
        completeness: source.status === "partial" ? "partial" as const : "unknown" as const,
        observedAt: source.provenance.observedAt,
        citationIds: [...new Set(evidence.map((item) => item.id))],
        citationEligible: evidence.length > 0,
        sourceAuthority: source.provenance.authority,
        provenance: source.provenance,
        reasonCode: source.status === "available" ? undefined : `source-${source.status}`,
      };
    });

  return { facts, sourceCoverage, diagnostics, omissions };
}

export const codebeamerRequirementFactAdapter: GenericFactSourceAdapterV1 = {
  adapterId: CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1.adapterId,
  adapterVersion: CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1.adapterVersion,
  sourceApplication: CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1.sourceApplication,
  map: mapCodebeamerRequirementFacts,
};

export { mapCodebeamerRequirementFacts };
