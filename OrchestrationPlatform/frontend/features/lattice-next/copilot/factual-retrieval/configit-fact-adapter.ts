import type {
  EngineeringIntelligenceInvestigationV1,
  IntelligenceEntity,
  IntelligenceSourceFieldMetadata,
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
  CONFIGIT_FIELD_REGISTRY_V1,
  resolveConfigitFields,
  type ConfigitFieldV1,
} from "./configit-field-registry.v1";
import type {
  CanonicalFactAdapterInputV1,
  GenericFactAdapterResultV1,
  GenericFactSourceAdapterV1,
} from "./source-fact-adapter";

type SourceEvidence = EngineeringIntelligenceInvestigationV1["evidence"][number];
type SourceRecord = EngineeringIntelligenceInvestigationV1["sources"][number];
type CandidateField = {
  field: ConfigitFieldV1;
  candidate: IntelligenceSourceFieldMetadata;
};

const sourceValueType = (value: unknown): FactValueTypeV1 => {
  if (typeof value === "string") return "text";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "scalar";
  if (Array.isArray(value)) return "list";
  return "structured";
};

const valueTypeFor = (expected: FactValueTypeV1, sourceValue: unknown): FactValueTypeV1 => {
  if (expected === "boolean") return typeof sourceValue === "boolean" ? "boolean" : sourceValueType(sourceValue);
  if (expected === "identifier") {
    return typeof sourceValue === "string" || typeof sourceValue === "number"
      ? "identifier"
      : sourceValueType(sourceValue);
  }
  if (expected === "status") {
    return typeof sourceValue === "string" ? "status" : sourceValueType(sourceValue);
  }
  if (expected === "text") return typeof sourceValue === "string" ? "text" : sourceValueType(sourceValue);
  return expected;
};

const matchingSourceRecord = (
  investigation: EngineeringIntelligenceInvestigationV1,
  entityId: string,
): SourceRecord | undefined => investigation.sources.find((source) =>
  source.entityId === entityId && source.source === CONFIGIT_FIELD_REGISTRY_V1.sourceApplication,
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

const dimensionsFor = (candidate: IntelligenceSourceFieldMetadata): FactDimensionV1[] => {
  const raw = candidate.sourceScope?.dimensions ?? [];
  return raw.flatMap((dimension) => {
    if (!dimension || typeof dimension !== "object") return [];
    const item = dimension as Record<string, unknown>;
    const dimensionId = typeof item.dimensionId === "string" ? item.dimensionId : "";
    const label = typeof item.label === "string" ? item.label : "";
    if (!dimensionId || !label || !Object.prototype.hasOwnProperty.call(item, "exactValue")) return [];
    return [{
      dimensionId,
      label,
      exactValue: item.exactValue,
      valueType: typeof item.valueType === "string"
        ? item.valueType as FactValueTypeV1
        : sourceValueType(item.exactValue),
      ...(typeof item.unit === "string" && item.unit ? { unit: item.unit } : {}),
    }];
  });
};

const evidenceSupportsField = (
  field: ConfigitFieldV1,
  candidate: IntelligenceSourceFieldMetadata,
  evidence: SourceEvidence,
): boolean => {
  const hasFieldScope = evidence.sourceFieldName !== undefined || evidence.fieldId !== undefined;
  const fieldScopeMatches =
    (evidence.sourceFieldName === undefined || evidence.sourceFieldName === candidate.sourceFieldName) &&
    (evidence.fieldId === undefined || evidence.fieldId === field.fieldId);
  if (!fieldScopeMatches) return false;
  if (evidence.kind === "source-record") return hasFieldScope;
  return (evidence.kind === "source-field" || evidence.kind === "document") && hasFieldScope;
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
  if (!entityMatch && !nativeIdMatch) return false;
  if (evidenceNativeId && nativeId && evidenceNativeId !== nativeId) return false;
  return true;
};

const entityCitationSupportsCandidate = (
  citationId: string,
  entity: IntelligenceEntity,
  field: ConfigitFieldV1,
  candidate: IntelligenceSourceFieldMetadata,
): boolean => {
  const citation = parseNavigableCitationId({ kind: "entity", citationId });
  const sourceNativeId = candidate.sourceProvenance?.nativeId;
  return citation?.id === entity.id &&
    field.factRole === "entity-identity" &&
    entity.assertion === "fact" &&
    entity.provenance.source === CONFIGIT_FIELD_REGISTRY_V1.sourceApplication &&
    candidate.sourceProvenance?.source === CONFIGIT_FIELD_REGISTRY_V1.sourceApplication &&
    Boolean(sourceNativeId) &&
    entity.provenance.nativeId === sourceNativeId &&
    candidate.sourceValue === sourceNativeId;
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
  field: ConfigitFieldV1,
  candidate: IntelligenceSourceFieldMetadata,
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
    if (
      sourceEvidence &&
      sameEvidenceIdentityScope(entity, candidate, sourceEvidence) &&
      evidenceSupportsField(field, candidate, sourceEvidence) &&
      sourceEvidence.source === CONFIGIT_FIELD_REGISTRY_V1.sourceApplication
    ) {
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
        ? {
            origin: rejectedCitationIds.some((id) =>
              !citationEvidenceId(id) || !investigation.evidence.some((item) => item.id === citationEvidenceId(id)),
            ) ? "canonical-projection" : "candidate-construction",
          }
        : {}),
    };
  }

  const missingCanonicalEvidence = candidateCitationIds.some((id) => {
    const evidenceId = citationEvidenceId(id);
    return Boolean(evidenceId) && !investigation.evidence.some((item) => item.id === evidenceId);
  });
  const origin: FactCitationLinkageOriginV1 = candidateCitationIds.length
    ? (missingCanonicalEvidence ? "canonical-projection" : "candidate-construction")
    : "source-extraction";
  return { citationIds: [], evidence: [], origin, rejectedCitationIds: candidateCitationIds };
};

const candidateFields = (
  entity: IntelligenceEntity,
  diagnostics: FactAdapterDiagnosticV1[],
): readonly CandidateField[] => {
  const fields: CandidateField[] = [];
  for (const candidates of Object.values(entity.sourceFieldMetadata ?? {})) {
    for (const candidate of candidates) {
      const registrations = resolveConfigitFields(candidate.sourceFieldName);
      if (!registrations.length) {
        diagnostics.push({
          code: "unmapped-field",
          message: "Source field is not registered for Configit facts.",
          sourceApplication: CONFIGIT_FIELD_REGISTRY_V1.sourceApplication,
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
    sourceApplication: CONFIGIT_FIELD_REGISTRY_V1.sourceApplication,
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
  field: ConfigitFieldV1,
  candidate?: IntelligenceSourceFieldMetadata,
  citationIds?: readonly string[],
  citationLinkageOrigin?: FactCitationLinkageOriginV1,
): FactAdapterDiagnosticV1 => ({
  code,
  message,
  sourceApplication: CONFIGIT_FIELD_REGISTRY_V1.sourceApplication,
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
  field: ConfigitFieldV1,
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
  const valueType = valueTypeFor(field.valueType, candidate.sourceValue);
  const transformations: FactTransformationV1[] = (candidate.sourceTransformations ?? []).map((step) => ({
    ruleId: step.ruleId,
    ruleVersion: step.ruleVersion,
    operation: step.operation,
    reversible: step.reversible,
  }));
  const dimensions = dimensionsFor(candidate);
  const completeness: FactCompletenessV1 = candidate.completeness ??
    (source?.status === "partial" ? "partial" : "unknown");

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
    sourceApplication: CONFIGIT_FIELD_REGISTRY_V1.sourceApplication,
    sourceEntityId: entity.id,
    sourceNativeId: candidate.sourceProvenance.nativeId,
    canonicalEntityKind: entity.kind,
    nativeRecordKind: (candidate as Record<string, unknown>).nativeRecordKind as string | undefined,
    fieldId: field.fieldId,
    sourceFieldName: candidate.sourceFieldName,
    displayLabel: field.displayLabel,
    factRole: field.factRole,
    exactSourceValue: candidate.sourceValue,
    sourceValueType: actualSourceType,
    valueType,
    dimensions,
    observedAt: candidate.observedAt ?? candidate.sourceProvenance.observedAt,
    extractedAt: candidate.extractedAt,
    capturedAt: candidate.capturedAt,
    effectiveAt: candidate.effectiveAt ?? candidate.sourceScope?.effectiveAt,
    validFrom: candidate.validFrom ?? candidate.sourceScope?.validFrom,
    validTo: candidate.validTo ?? candidate.sourceScope?.validTo,
    freshness: candidate.freshness ?? "unknown",
    completeness,
    derivationStatus: "raw",
    transformationTrace: transformations,
    citationIds,
    citationEligible: citationIds.length > 0,
    sourceAuthority: candidate.sourceAuthority,
    provenance: {
      source: candidate.sourceProvenance,
      evidence: citationLinkage.evidence.map((item) => ({ id: item.id, provenance: item.provenance })),
      sourceFieldName: candidate.sourceFieldName,
      candidateId: candidate.candidateId,
      sourceScope: candidate.sourceScope,
    },
  };
  return { fact };
};

export const configitFactSourceAdapterV1: GenericFactSourceAdapterV1 = {
  adapterId: CONFIGIT_FIELD_REGISTRY_V1.adapterId,
  adapterVersion: CONFIGIT_FIELD_REGISTRY_V1.adapterVersion,
  sourceApplication: CONFIGIT_FIELD_REGISTRY_V1.sourceApplication,
  map(input: CanonicalFactAdapterInputV1): GenericFactAdapterResultV1 {
    const { investigation } = input;
    const facts: GenericFactV1[] = [];
    const diagnostics: FactAdapterDiagnosticV1[] = [];
    const omissions: FactAdapterOmissionV1[] = [];
    const eligibleEntities = investigation.entities.filter((entity) =>
      entity.assertion === "fact" &&
      entity.provenance.source === CONFIGIT_FIELD_REGISTRY_V1.sourceApplication,
    );

    for (const entity of eligibleEntities) {
      const source = matchingSourceRecord(investigation, entity.id);
      const sourceFields = candidateFields(entity, diagnostics);

      for (const field of CONFIGIT_FIELD_REGISTRY_V1.fields) {
        const candidates = sourceFields
          .filter((item) => item.field.fieldId === field.fieldId)
          .map((item) => item.candidate);
        if (!candidates.length) {
          // Omit only for entities that could plausibly carry this field? to avoid noisy omissions,
          // emit when sourceFieldMetadata exists for a matching native record kind in entity context.
          continue;
        }

        for (const candidate of candidates) {
          const citationLinkage = citationLinkageFor(investigation, entity, field, candidate);
          const result = makeFact(investigation, entity, field, candidate, citationLinkage, source);
          if (!result.fact) {
            omissions.push(omission(
              investigation,
              entity,
              field.fieldId,
              !candidate.sourceProvenance ? "missing-provenance"
                : !candidate.sourceAuthority ? "missing-source-authority"
                  : "source-value-unavailable",
              result.unsupportedReason ?? "The source candidate cannot be represented safely.",
              candidate,
              citationLinkage.origin,
            ));
            continue;
          }

          const validation = validateGenericFactV1(result.fact);
          if (!validation.valid) {
            diagnostics.push(...validation.diagnostics);
          } else {
            facts.push(validation.fact);
            if (field.citationRequired && !validation.fact.citationEligible) {
              omissions.push(omission(
                investigation,
                entity,
                field.fieldId,
                "invalid-citation-linkage",
                "No eligible explicit citation supports this Configit field and scope.",
                candidate,
                citationLinkage.origin,
              ));
              diagnostics.push(diagnostic(
                "invalid-citation-linkage",
                "No eligible explicit citation supports this Configit field and scope.",
                entity,
                field,
                candidate,
                candidate.citationIds ?? [],
                citationLinkage.origin,
              ));
            }
          }
        }
      }
    }

    const byFieldEntity = new Set(facts.map((fact) => `${fact.sourceEntityId}::${fact.fieldId}`));
    const omittedKeys = new Set(omissions.map((item) => `${item.sourceEntityId ?? item.scope.entityId}::${item.fieldId}`));
    for (const entity of eligibleEntities) {
      const sourceFields = candidateFields(entity, []);
      if (!sourceFields.length) continue;
      for (const field of CONFIGIT_FIELD_REGISTRY_V1.fields) {
        const key = `${entity.id}::${field.fieldId}`;
        const hasCandidates = sourceFields.some((item) => item.field.fieldId === field.fieldId);
        if (hasCandidates && !byFieldEntity.has(key) && !omittedKeys.has(key)) {
          omissions.push(omission(
            investigation,
            entity,
            field.fieldId,
            "source-value-unavailable",
            "No safe Configit fact could be emitted for this source-backed field.",
          ));
        }
      }
    }

    const sourceCoverage: SourceCoverageStatementV1[] = eligibleEntities.flatMap((entity) => {
      if (!Object.keys(entity.sourceFieldMetadata ?? {}).length) return [];
      const source = matchingSourceRecord(investigation, entity.id);
      return [{
        contractVersion: FACTUAL_EVIDENCE_CONTRACT_VERSION,
        investigationId: investigation.investigationId,
        subjectId: investigation.subject.id,
        sourceApplication: CONFIGIT_FIELD_REGISTRY_V1.sourceApplication,
        sourceEntityId: entity.id,
        status: "available",
        completeness: source?.status === "partial" ? "partial" : "unknown",
        observedAt: entity.temporal.capturedAt ?? entity.provenance.observedAt,
        citationIds: [],
        citationEligible: false,
        sourceAuthority: entity.provenance.authority,
        provenance: entity.provenance,
      }];
    });

    return { facts, sourceCoverage, diagnostics, omissions };
  },
};

export function mapConfigitFacts(input: CanonicalFactAdapterInputV1): GenericFactAdapterResultV1 {
  return configitFactSourceAdapterV1.map(input);
}
