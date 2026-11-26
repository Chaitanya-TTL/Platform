import type {
  EngineeringIntelligenceInvestigationV1,
  IntelligenceEntity,
  IntelligenceSourceFieldMetadata,
  TemporalContext,
} from "../../contracts/intelligence-v1";
import {
  FACTUAL_EVIDENCE_CONTRACT_VERSION,
  type FactAdapterDiagnosticV1,
  type FactAdapterOmissionV1,
  type FactCitationLinkageOriginV1,
  type FactCompletenessV1,
  type FactDimensionV1,
  type FactTransformationV1,
  type FactValueTypeV1,
  type GenericFactV1,
  type SourceCoverageStatementV1,
  validateGenericFactV1,
} from "../../contracts/factual-evidence-v1";
import { parseNavigableCitationId } from "../citation-id";
import {
  WINDCHILL_PART_FIELD_REGISTRY_V1,
  resolveWindchillPartFields,
  type WindchillPartFieldV1,
} from "./windchill-part-field-registry.v1";
import type {
  CanonicalFactAdapterInputV1,
  GenericFactAdapterResultV1,
  GenericFactSourceAdapterV1,
} from "./source-fact-adapter";

type SourceEvidence = EngineeringIntelligenceInvestigationV1["evidence"][number];
type SourceRecord = EngineeringIntelligenceInvestigationV1["sources"][number];
type CandidateField = {
  field: WindchillPartFieldV1;
  candidate: IntelligenceSourceFieldMetadata;
};
type ExplicitQuantity =
  | { supported: true; unit?: string; dimensions: readonly FactDimensionV1[]; trace: FactTransformationV1 }
  | { supported: false; reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const sourceValueType = (value: unknown): FactValueTypeV1 => {
  if (typeof value === "string") return "text";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "scalar";
  if (Array.isArray(value)) return "list";
  return "structured";
};

const valueTypeFor = (
  expected: FactValueTypeV1,
  sourceValue: unknown,
  parsedQuantity?: ExplicitQuantity,
): FactValueTypeV1 => {
  switch (expected) {
    case "quantity":
      return parsedQuantity?.supported ? "quantity" : sourceValueType(sourceValue);
    case "boolean":
      return typeof sourceValue === "boolean" ? "boolean" : sourceValueType(sourceValue);
    case "identifier":
      return typeof sourceValue === "string" || typeof sourceValue === "number"
        ? "identifier"
        : sourceValueType(sourceValue);
    case "status":
      return typeof sourceValue === "string" || isRecord(sourceValue)
        ? "status"
        : sourceValueType(sourceValue);
    case "text":
      return typeof sourceValue === "string" ? "text" : sourceValueType(sourceValue);
    case "structured":
      return sourceValueType(sourceValue);
    default:
      return expected;
  }
};

const knownValueType = (value: unknown): value is FactValueTypeV1 =>
  typeof value === "string" &&
  [
    "scalar",
    "text",
    "boolean",
    "date",
    "status",
    "identifier",
    "quantity",
    "money",
    "list",
    "structured",
  ].includes(value);

const matchingSourceRecord = (
  investigation: EngineeringIntelligenceInvestigationV1,
  entityId: string,
): SourceRecord | undefined => investigation.sources.find((source) =>
  source.entityId === entityId &&
  source.source === WINDCHILL_PART_FIELD_REGISTRY_V1.sourceApplication,
);

const sourceEvidenceFor = (
  investigation: EngineeringIntelligenceInvestigationV1,
): readonly SourceEvidence[] => investigation.evidence.filter((evidence) =>
  evidence.source === WINDCHILL_PART_FIELD_REGISTRY_V1.sourceApplication,
);

const citationEvidenceId = (citationId: string): string | undefined => {
  const prefix = "cite:evidence:";
  if (!citationId.startsWith(prefix)) {
    return citationId.startsWith("cite:") ? undefined : citationId;
  }
  const encodedId = citationId.slice(prefix.length);
  if (!encodedId) return undefined;
  try {
    const id = decodeURIComponent(encodedId);
    return id && encodeURIComponent(id) === encodedId ? id : undefined;
  } catch {
    return undefined;
  }
};

const candidateRevisionValues = (
  candidate: IntelligenceSourceFieldMetadata,
): readonly unknown[] => [
  candidate.sourceScope?.revision,
  ...(candidate.sourceScope?.dimensions ?? [])
    .filter((dimension) => dimension.dimensionId === "source-revision")
    .map((dimension) => dimension.exactValue),
  candidate.sourceProvenance?.nativeRevision,
].filter((value) => value !== undefined);

const candidateRevision = (
  candidate: IntelligenceSourceFieldMetadata,
): string | undefined => {
  const revision = candidateRevisionValues(candidate)[0];
  return typeof revision === "string" ? revision : undefined;
};

const hasConsistentRevisionScope = (
  candidate: IntelligenceSourceFieldMetadata,
): boolean => {
  const revisions = candidateRevisionValues(candidate);
  return revisions.every((revision) => typeof revision === "string") &&
    new Set(revisions).size <= 1;
};

const sameTemporalScope = (
  candidate: IntelligenceSourceFieldMetadata,
  temporal: TemporalContext,
): boolean => {
  const scope = [
    [candidate.effectiveAt, candidate.sourceScope?.effectiveAt, temporal.effectiveAt],
    [candidate.validFrom, candidate.sourceScope?.validFrom, temporal.validFrom],
    [candidate.validTo, candidate.sourceScope?.validTo, temporal.validTo],
  ];
  return scope.every(([candidateValue, sourceScopeValue, evidenceValue]) =>
    (candidateValue === undefined || sourceScopeValue === undefined ||
      candidateValue === sourceScopeValue) &&
    (candidateValue ?? sourceScopeValue) === evidenceValue,
  );
};

const sameEvidenceIdentityScope = (
  entity: IntelligenceEntity,
  candidate: IntelligenceSourceFieldMetadata,
  evidence: SourceEvidence,
): boolean => {
  const nativeId = candidate.sourceProvenance?.nativeId;
  const evidenceNativeId = evidence.provenance.nativeId;
  const entityMatch = evidence.provenance.artifactReference === entity.id;
  const nativeIdMatch = Boolean(nativeId && evidenceNativeId === nativeId);
  if ((!entityMatch && !nativeIdMatch) ||
      (evidenceNativeId && nativeId && evidenceNativeId !== nativeId)) {
    return false;
  }
  return hasConsistentRevisionScope(candidate) &&
    evidence.provenance.nativeRevision === candidateRevision(candidate) &&
    sameTemporalScope(candidate, evidence.temporal);
};

const evidenceSupportsField = (
  field: WindchillPartFieldV1,
  candidate: IntelligenceSourceFieldMetadata,
  evidence: SourceEvidence,
): boolean => {
  const hasFieldScope = evidence.sourceFieldName !== undefined ||
    evidence.fieldId !== undefined;
  const fieldScopeMatches =
    (evidence.sourceFieldName === undefined ||
      evidence.sourceFieldName === candidate.sourceFieldName) &&
    (evidence.fieldId === undefined || evidence.fieldId === field.fieldId);
  if (!fieldScopeMatches) return false;
  if (evidence.kind === "source-record") return hasFieldScope;
  return (evidence.kind === "source-field" || evidence.kind === "document") &&
    hasFieldScope;
};

const evidenceSupportsCandidate = (
  entity: IntelligenceEntity,
  field: WindchillPartFieldV1,
  candidate: IntelligenceSourceFieldMetadata,
  evidence: SourceEvidence,
): boolean =>
  candidate.sourceProvenance?.source === WINDCHILL_PART_FIELD_REGISTRY_V1.sourceApplication &&
  evidence.source === WINDCHILL_PART_FIELD_REGISTRY_V1.sourceApplication &&
  sameEvidenceIdentityScope(entity, candidate, evidence) &&
  evidenceSupportsField(field, candidate, evidence);

const entityCitationSupportsCandidate = (
  citationId: string,
  entity: IntelligenceEntity,
  field: WindchillPartFieldV1,
  candidate: IntelligenceSourceFieldMetadata,
): boolean => {
  const citation = parseNavigableCitationId({ kind: "entity", citationId });
  const sourceNativeId = candidate.sourceProvenance?.nativeId;
  return citation?.id === entity.id &&
    field.factRole === "entity-identity" &&
    entity.assertion === "fact" &&
    entity.provenance.source === WINDCHILL_PART_FIELD_REGISTRY_V1.sourceApplication &&
    candidate.sourceProvenance?.source === WINDCHILL_PART_FIELD_REGISTRY_V1.sourceApplication &&
    Boolean(sourceNativeId) &&
    hasConsistentRevisionScope(candidate) &&
    entity.provenance.nativeId === sourceNativeId &&
    candidate.sourceValue === sourceNativeId &&
    entity.provenance.nativeRevision === candidateRevision(candidate) &&
    sameTemporalScope(candidate, entity.temporal);
};

type CitationLinkageV1 = {
  citationIds: readonly string[];
  evidence: readonly SourceEvidence[];
  origin?: FactCitationLinkageOriginV1;
  rejectedCitationIds: readonly string[];
};

const citationLinkageFor = (
  investigation: EngineeringIntelligenceInvestigationV1,
  entity: IntelligenceEntity,
  field: WindchillPartFieldV1,
  candidate: IntelligenceSourceFieldMetadata,
  evidence: readonly SourceEvidence[],
): CitationLinkageV1 => {
  const candidateCitationIds = [...new Set(candidate.citationIds ?? [])];
  const acceptedCitationIds: string[] = [];
  const acceptedEvidence: SourceEvidence[] = [];
  const rejectedCitationIds: string[] = [];

  for (const citationId of candidateCitationIds) {
    if (entityCitationSupportsCandidate(citationId, entity, field, candidate)) {
      acceptedCitationIds.push(citationId);
      continue;
    }

    const evidenceId = citationEvidenceId(citationId);
    const sourceEvidence = evidenceId
      ? investigation.evidence.find((item) => item.id === evidenceId)
      : undefined;
    if (sourceEvidence &&
        evidenceSupportsCandidate(entity, field, candidate, sourceEvidence)) {
      acceptedCitationIds.push(citationId);
      acceptedEvidence.push(sourceEvidence);
    } else {
      rejectedCitationIds.push(citationId);
    }
  }

  if (acceptedCitationIds.length) {
    return {
      citationIds: acceptedCitationIds,
      evidence: acceptedEvidence,
      rejectedCitationIds,
      ...(rejectedCitationIds.length
        ? { origin: rejectedCitationIds.some((id) =>
            !citationEvidenceId(id) ||
            !investigation.evidence.some((item) => item.id === citationEvidenceId(id)),
          )
            ? "canonical-projection"
            : "candidate-construction" }
        : {}),
    };
  }

  const unlinkedEvidenceExists = evidence.some((item) =>
    evidenceSupportsCandidate(entity, field, candidate, item),
  );
  const missingCanonicalEvidence = candidateCitationIds.some((id) => {
    const evidenceId = citationEvidenceId(id);
    return Boolean(evidenceId) &&
      !investigation.evidence.some((item) => item.id === evidenceId);
  });
  const origin: FactCitationLinkageOriginV1 = candidateCitationIds.length
    ? missingCanonicalEvidence ? "canonical-projection" : "candidate-construction"
    : unlinkedEvidenceExists
      ? "candidate-construction"
      : candidate.citationLinkageOrigin ?? "source-extraction";
  return {
    citationIds: [],
    evidence: [],
    origin,
    rejectedCitationIds: candidateCitationIds,
  };
};

const completenessFor = (source?: SourceRecord): FactCompletenessV1 =>
  source?.status === "partial" ? "partial" : "unknown";

const dimensionsFor = (
  candidate: IntelligenceSourceFieldMetadata,
): FactDimensionV1[] => {
  const dimensions = (candidate.sourceScope?.dimensions ?? []).flatMap((dimension) => {
    if (!dimension.dimensionId || !dimension.label ||
        !hasOwn(dimension, "exactValue")) return [];
    return [{
      dimensionId: dimension.dimensionId,
      label: dimension.label,
      exactValue: dimension.exactValue,
      valueType: knownValueType(dimension.valueType)
        ? dimension.valueType
        : sourceValueType(dimension.exactValue),
      ...(dimension.unit ? { unit: dimension.unit } : {}),
    }];
  });
  if (dimensions.length || !candidate.sourceScope?.revision) return dimensions;
  return [{
    dimensionId: "source-revision",
    label: "Revision",
    exactValue: candidate.sourceScope.revision,
    valueType: "identifier",
  }];
};

const taggedMetadata = (
  candidate: IntelligenceSourceFieldMetadata,
  representation: string,
): boolean => {
  const adapterMetadata = candidate.sourceAdapterMetadata;
  if (!adapterMetadata || adapterMetadata.adapterId !== WINDCHILL_PART_FIELD_REGISTRY_V1.adapterId ||
      adapterMetadata.schemaVersion !== WINDCHILL_PART_FIELD_REGISTRY_V1.adapterVersion ||
      !isRecord(adapterMetadata.metadata)) return false;
  return adapterMetadata.metadata.representation === representation;
};

const validUnit = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const explicitValueUnit = (value: unknown): ExplicitQuantity => {
  if (!isRecord(value) || !hasOwn(value, "Value") || !hasOwn(value, "Unit") ||
      typeof value.Value !== "number" || !Number.isFinite(value.Value) ||
      !validUnit(value.Unit) || Object.keys(value).length !== 2) {
    return { supported: false, reason: "The registered value-unit shape is incomplete." };
  }
  return {
    supported: true,
    unit: value.Unit,
    dimensions: [],
    trace: {
      ruleId: "windchill-explicit-value-unit",
      ruleVersion: "1.0",
      operation: "validate-registered-quantity-shape",
      inputType: "structured",
      outputType: "quantity",
      reversible: true,
    },
  };
};

const explicitAxisCollection = (value: unknown): ExplicitQuantity => {
  if (!isRecord(value) || !Array.isArray(value.axes) ||
      Object.keys(value).length !== 1 || value.axes.length === 0) {
    return { supported: false, reason: "The registered axis collection is incomplete." };
  }
  const dimensions: FactDimensionV1[] = [];
  const seen = new Set<string>();
  for (const axis of value.axes) {
    if (!isRecord(axis) || typeof axis.Axis !== "string" || !axis.Axis.trim() ||
        typeof axis.Value !== "number" || !Number.isFinite(axis.Value) ||
        !validUnit(axis.Unit) ||
        Object.keys(axis).length !== 3) {
      return { supported: false, reason: "An axis lacks an explicit label, value, or unit." };
    }
    if (seen.has(axis.Axis)) {
      return { supported: false, reason: "Axis labels must be unique within a dimension value." };
    }
    seen.add(axis.Axis);
    dimensions.push({
      dimensionId: `axis:${encodeURIComponent(axis.Axis)}`,
      label: axis.Axis,
      exactValue: axis.Value,
      valueType: "scalar",
      unit: axis.Unit,
    });
  }
  return {
    supported: true,
    dimensions,
    trace: {
      ruleId: "windchill-explicit-axis-collection",
      ruleVersion: "1.0",
      operation: "validate-registered-axis-collection",
      inputType: "structured",
      outputType: "quantity",
      reversible: true,
    },
  };
};

const structuredQuantityFor = (
  candidate: IntelligenceSourceFieldMetadata,
): ExplicitQuantity | undefined => {
  if (taggedMetadata(candidate, "value-unit-v1")) {
    return explicitValueUnit(candidate.sourceValue);
  }
  if (taggedMetadata(candidate, "axis-collection-v1")) {
    return explicitAxisCollection(candidate.sourceValue);
  }
  return undefined;
};

const candidateFields = (
  entity: IntelligenceEntity,
  diagnostics: FactAdapterDiagnosticV1[],
): readonly CandidateField[] => {
  const fields: CandidateField[] = [];
  for (const candidates of Object.values(entity.sourceFieldMetadata ?? {})) {
    for (const candidate of candidates) {
      const registrations = resolveWindchillPartFields(candidate.sourceFieldName);
      if (!registrations.length) {
        diagnostics.push({
          code: "unmapped-field",
          message: "Source field is not registered for Windchill part facts.",
          sourceApplication: WINDCHILL_PART_FIELD_REGISTRY_V1.sourceApplication,
          sourceEntityId: entity.id,
          sourceFieldName: candidate.sourceFieldName,
          provenance: candidate.sourceProvenance,
        });
        continue;
      }
      for (const field of registrations) fields.push({ field, candidate });
    }
  }
  return fields;
};

const omission = (
  investigation: EngineeringIntelligenceInvestigationV1,
  entity: IntelligenceEntity,
  fieldId: string,
  reasonCode: FactAdapterOmissionV1["reasonCode"],
  reason: string,
  candidate?: IntelligenceSourceFieldMetadata,
  citationLinkageOrigin?: FactCitationLinkageOriginV1,
): FactAdapterOmissionV1 => ({
  scope: {
    investigationId: investigation.investigationId,
    subjectId: investigation.subject.id,
    sourceApplication: WINDCHILL_PART_FIELD_REGISTRY_V1.sourceApplication,
    entityId: entity.id,
    sourceNativeId: candidate?.sourceProvenance?.nativeId,
    canonicalEntityKind: entity.kind,
    fieldId,
  },
  sourceEntityId: entity.id,
  sourceNativeId: candidate?.sourceProvenance?.nativeId,
  fieldId,
  sourceFieldName: candidate?.sourceFieldName,
  reasonCode,
  reason,
  citationIds: candidate?.citationIds ?? [],
  citationLinkageOrigin,
  provenance: candidate?.sourceProvenance,
});

const diagnostic = (
  code: FactAdapterDiagnosticV1["code"],
  message: string,
  entity: IntelligenceEntity,
  field: WindchillPartFieldV1,
  candidate?: IntelligenceSourceFieldMetadata,
  citationIds?: readonly string[],
  citationLinkageOrigin?: FactCitationLinkageOriginV1,
): FactAdapterDiagnosticV1 => ({
  code,
  message,
  sourceApplication: WINDCHILL_PART_FIELD_REGISTRY_V1.sourceApplication,
  sourceEntityId: entity.id,
  sourceNativeId: candidate?.sourceProvenance?.nativeId,
  fieldId: field.fieldId,
  sourceFieldName: candidate?.sourceFieldName,
  citationIds,
  citationLinkageOrigin,
  provenance: candidate?.sourceProvenance,
});

const makeFact = (
  investigation: EngineeringIntelligenceInvestigationV1,
  entity: IntelligenceEntity,
  field: WindchillPartFieldV1,
  candidate: IntelligenceSourceFieldMetadata,
  citationLinkage: CitationLinkageV1,
  source?: SourceRecord,
): { fact?: GenericFactV1; unsupportedReason?: string } => {
  if (candidate.sourceValue === undefined || candidate.sourceValue === null) {
    return { unsupportedReason: "No exact source value was preserved." };
  }
  if (!candidate.sourceProvenance || !candidate.sourceAuthority) {
    return { unsupportedReason: "The source candidate lacks its own provenance or authority." };
  }

  const citationIds = [...new Set(citationLinkage.citationIds)];
  const actualSourceType = sourceValueType(candidate.sourceValue);
  const parsedQuantity = field.valueType === "quantity"
    ? structuredQuantityFor(candidate)
    : undefined;
  const valueType = valueTypeFor(field.valueType, candidate.sourceValue, parsedQuantity);
  const dimensions = [
    ...dimensionsFor(candidate),
    ...(parsedQuantity?.supported ? parsedQuantity.dimensions : []),
  ];
  const transformations: FactTransformationV1[] = [
    ...(candidate.sourceTransformations ?? []).map((transformation) => ({
      ruleId: transformation.ruleId,
      ruleVersion: transformation.ruleVersion,
      operation: transformation.operation,
      reversible: transformation.reversible,
    })),
    ...(parsedQuantity?.supported ? [parsedQuantity.trace] : []),
  ];
  const sourceScope = candidate.sourceScope;
  const normalized = transformations.some((step) =>
    step.operation === "display-normalization",
  ) && candidate.displayValue !== undefined;
  const fact: GenericFactV1 = {
    contractVersion: FACTUAL_EVIDENCE_CONTRACT_VERSION,
    factId: [
      "fact",
      encodeURIComponent(investigation.investigationId),
      encodeURIComponent(entity.id),
      encodeURIComponent(field.fieldId),
      encodeURIComponent(candidate.sourceFieldName),
      encodeURIComponent(candidate.candidateId ?? field.fieldId),
    ].join(":"),
    investigationId: investigation.investigationId,
    subjectId: investigation.subject.id,
    sourceApplication: WINDCHILL_PART_FIELD_REGISTRY_V1.sourceApplication,
    sourceEntityId: entity.id,
    sourceNativeId: candidate.sourceProvenance.nativeId,
    canonicalEntityKind: entity.kind,
    nativeRecordKind: entity.kind === "part-revision" ? "part-revision" : "part",
    fieldId: field.fieldId,
    sourceFieldName: candidate.sourceFieldName,
    displayLabel: field.displayLabel,
    factRole: field.factRole,
    exactSourceValue: candidate.sourceValue,
    sourceValueType: actualSourceType,
    valueType,
    ...(normalized
      ? {
          normalizedValue: candidate.displayValue,
          normalizedValueType: sourceValueType(candidate.displayValue),
        }
      : {}),
    ...(parsedQuantity?.supported && parsedQuantity.unit
      ? { unit: parsedQuantity.unit }
      : {}),
    dimensions,
    observedAt: candidate.observedAt ?? candidate.sourceProvenance.observedAt,
    extractedAt: candidate.extractedAt,
    capturedAt: candidate.capturedAt,
    effectiveAt: candidate.effectiveAt ?? sourceScope?.effectiveAt,
    validFrom: candidate.validFrom ?? sourceScope?.validFrom,
    validTo: candidate.validTo ?? sourceScope?.validTo,
    freshness: candidate.freshness ?? "unknown",
    completeness: candidate.completeness ?? completenessFor(source),
    derivationStatus: normalized ? "normalized" : "raw",
    transformationTrace: transformations,
    citationIds,
    citationEligible: citationIds.length > 0,
    sourceAuthority: candidate.sourceAuthority,
    provenance: {
      source: candidate.sourceProvenance,
      evidence: citationLinkage.evidence
        .map((item) => ({ id: item.id, provenance: item.provenance })),
      sourceFieldName: candidate.sourceFieldName,
      candidateId: candidate.candidateId,
      sourceScope,
    },
  };
  return {
    fact,
    ...(field.valueType === "quantity" && !parsedQuantity?.supported
      ? {
          unsupportedReason: parsedQuantity?.reason ??
            "A structured quantity requires registered explicit-value metadata.",
        }
      : {}),
  };
};

function mapWindchillPartFacts(
  input: CanonicalFactAdapterInputV1,
): GenericFactAdapterResultV1 {
  const { investigation } = input;
  const facts: GenericFactV1[] = [];
  const diagnostics: FactAdapterDiagnosticV1[] = [];
  const omissions: FactAdapterOmissionV1[] = [];
  const eligibleEntities = investigation.entities.filter((entity) =>
    (entity.kind === "part-occurrence" || entity.kind === "part-revision" || entity.kind === "part") &&
    entity.assertion === "fact" &&
    entity.provenance.source === WINDCHILL_PART_FIELD_REGISTRY_V1.sourceApplication,
  );

  for (const entity of eligibleEntities) {
    const evidence = sourceEvidenceFor(investigation);
    const source = matchingSourceRecord(investigation, entity.id);
    const sourceFields = candidateFields(entity, diagnostics);

    for (const field of WINDCHILL_PART_FIELD_REGISTRY_V1.fields) {
      const candidates = sourceFields
        .filter((item) => item.field.fieldId === field.fieldId)
        .map((item) => item.candidate);
      if (!candidates.length) {
        omissions.push(omission(
          investigation,
          entity,
          field.fieldId,
          "source-value-unavailable",
          "No source-backed field candidate was preserved for this registered field.",
        ));
        continue;
      }

      for (const candidate of candidates) {
        const citationLinkage = citationLinkageFor(
          investigation,
          entity,
          field,
          candidate,
          evidence,
        );
        const result = makeFact(
          investigation,
          entity,
          field,
          candidate,
          citationLinkage,
          source,
        );
        if (!result.fact) {
          const reasonCode = candidate.sourceValue === undefined || candidate.sourceValue === null
            ? "source-value-unavailable"
            : !candidate.sourceProvenance
              ? "missing-provenance"
              : !candidate.sourceAuthority
                ? "missing-source-authority"
                : "unsupported-value-type";
          omissions.push(omission(
            investigation,
            entity,
            field.fieldId,
            reasonCode,
            result.unsupportedReason ?? "The source candidate could not be represented as a generic fact.",
            candidate,
          ));
          diagnostics.push(diagnostic(
            reasonCode,
            result.unsupportedReason ?? "The source candidate could not be represented as a generic fact.",
            entity,
            field,
            candidate,
          ));
          continue;
        }

        const validation = validateGenericFactV1(result.fact);
        if (!validation.valid) {
          diagnostics.push(...validation.diagnostics);
          omissions.push(omission(
            investigation,
            entity,
            field.fieldId,
            "unsupported-value-type",
            "The mapped source candidate did not satisfy the generic fact contract.",
            candidate,
          ));
          continue;
        }
        facts.push(validation.fact);

        if (result.unsupportedReason) {
          diagnostics.push(diagnostic(
            "unsupported-value-type",
            result.unsupportedReason,
            entity,
            field,
            candidate,
          ));
        }
        if (citationLinkage.rejectedCitationIds.length &&
            validation.fact.citationEligible) {
          diagnostics.push(diagnostic(
            "invalid-citation-linkage",
            "Some candidate-linked citations do not support this fact's source scope.",
            entity,
            field,
            candidate,
            citationLinkage.rejectedCitationIds,
            citationLinkage.origin ?? "candidate-construction",
          ));
        }
        if (field.citationRequired && !validation.fact.citationEligible) {
          const reason = "Source evidence did not provide an eligible citation reference.";
          omissions.push(omission(
            investigation,
            entity,
            field.fieldId,
            "missing-citation",
            reason,
            candidate,
            citationLinkage.origin,
          ));
          diagnostics.push(diagnostic(
            "missing-citation",
            reason,
            entity,
            field,
            candidate,
            citationLinkage.rejectedCitationIds,
            citationLinkage.origin,
          ));
        }
      }
    }
  }

  const sourceCoverage: SourceCoverageStatementV1[] = investigation.sources
    .filter((source) =>
      source.source === WINDCHILL_PART_FIELD_REGISTRY_V1.sourceApplication,
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
        completeness: source.status === "partial" ? "partial" : "unknown",
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

export const windchillPartFactAdapter: GenericFactSourceAdapterV1 = {
  adapterId: WINDCHILL_PART_FIELD_REGISTRY_V1.adapterId,
  adapterVersion: WINDCHILL_PART_FIELD_REGISTRY_V1.adapterVersion,
  sourceApplication: WINDCHILL_PART_FIELD_REGISTRY_V1.sourceApplication,
  map: mapWindchillPartFacts,
};
