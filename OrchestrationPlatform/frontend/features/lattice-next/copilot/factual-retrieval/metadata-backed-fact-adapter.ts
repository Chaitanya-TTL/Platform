import {
  FACTUAL_EVIDENCE_CONTRACT_VERSION,
  validateGenericFactV1,
  type FactAdapterDiagnosticV1,
  type FactAdapterOmissionV1,
  type FactDimensionV1,
  type FactValueTypeV1,
  type GenericFactV1,
  type SourceCoverageStatementV1,
} from "../../contracts/factual-evidence-v1";
import type {
  EngineeringIntelligenceInvestigationV1,
  EngineeringProvenance,
  IntelligenceEntity,
  IntelligenceSourceFieldMetadata,
} from "../../contracts/intelligence-v1";
import type { GenericFactAdapterResultV1 } from "./source-fact-adapter";

const SOURCE_APPLICATIONS = [
  "teamcenter",
  "windchill",
  "sap",
  "configit",
  "codebeamer",
] as const satisfies readonly NonNullable<EngineeringProvenance["source"]>[];

const isSourceApplication = (
  source: unknown,
): source is NonNullable<EngineeringProvenance["source"]> =>
  typeof source === "string" &&
  SOURCE_APPLICATIONS.some((application) => application === source);

const isFactValueType = (value: unknown): value is FactValueTypeV1 =>
  value === "scalar" ||
  value === "text" ||
  value === "boolean" ||
  value === "date" ||
  value === "status" ||
  value === "identifier" ||
  value === "quantity" ||
  value === "money" ||
  value === "list" ||
  value === "structured";

const sourceValueType = (value: unknown): FactValueTypeV1 => {
  if (typeof value === "string") return "text";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "scalar";
  if (Array.isArray(value)) return "list";
  return "structured";
};

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const sourceFieldCandidates = (
  entity: IntelligenceEntity,
): readonly IntelligenceSourceFieldMetadata[] => [
  ...Object.values(entity.sourceFieldMetadata ?? {}).flat(),
  ...Object.values(entity.properties).flatMap((property) => {
    if (!property.sourceFieldName || !hasOwn(property, "sourceValue")) return [];
    return [{
      ...property,
      sourceFieldName: property.sourceFieldName,
      sourceValue: property.sourceValue,
    }];
  }),
];

const parseEvidenceId = (citationId: string): string | undefined => {
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

const sourceEvidenceSupportsCandidate = (
  evidence: EngineeringIntelligenceInvestigationV1["evidence"][number],
  source: NonNullable<EngineeringProvenance["source"]>,
  entity: IntelligenceEntity,
  candidate: IntelligenceSourceFieldMetadata,
  fieldId: string,
): boolean => {
  if (
    evidence.source !== source ||
    evidence.provenance.source !== source ||
    !["source-field", "source-record", "document"].includes(evidence.kind)
  ) {
    return false;
  }
  if (
    (evidence.sourceFieldName !== undefined &&
      evidence.sourceFieldName !== candidate.sourceFieldName) ||
    (evidence.fieldId !== undefined && evidence.fieldId !== fieldId)
  ) {
    return false;
  }

  const fieldProvenance = candidate.sourceProvenance;
  if (!fieldProvenance) return false;
  const artifactReference = fieldProvenance.artifactReference;
  const nativeId = fieldProvenance.nativeId;
  const evidenceArtifactReference = evidence.provenance.artifactReference;
  const evidenceNativeId = evidence.provenance.nativeId;
  if (
    (artifactReference && evidenceArtifactReference &&
      artifactReference !== evidenceArtifactReference) ||
    (nativeId && evidenceNativeId && nativeId !== evidenceNativeId)
  ) {
    return false;
  }
  return Boolean(
    (artifactReference && artifactReference === evidenceArtifactReference) ||
    (nativeId && nativeId === evidenceNativeId) ||
    (!artifactReference && !nativeId &&
      evidenceArtifactReference === entity.id),
  );
};

const factDimensions = (
  candidate: IntelligenceSourceFieldMetadata,
): readonly FactDimensionV1[] =>
  (candidate.sourceScope?.dimensions ?? []).map((dimension) => ({
    dimensionId: dimension.dimensionId,
    label: dimension.label,
    exactValue: dimension.exactValue,
    valueType: isFactValueType(dimension.valueType)
      ? dimension.valueType
      : sourceValueType(dimension.exactValue),
    ...(dimension.unit !== undefined ? { unit: dimension.unit } : {}),
  }));

const stableCandidateKey = (
  entity: IntelligenceEntity,
  source: NonNullable<EngineeringProvenance["source"]>,
  candidate: IntelligenceSourceFieldMetadata,
): string => JSON.stringify([
  entity.id,
  source,
  candidate.sourceFieldName,
  candidate.candidateId,
  candidate.sourceProvenance?.nativeId,
  candidate.sourceProvenance?.artifactReference,
  candidate.sourceValue,
]);

const omission = (
  investigation: EngineeringIntelligenceInvestigationV1,
  entity: IntelligenceEntity,
  candidate: IntelligenceSourceFieldMetadata,
  source: NonNullable<EngineeringProvenance["source"]> | undefined,
  fieldId: string | undefined,
  reasonCode: FactAdapterOmissionV1["reasonCode"],
  reason: string,
): FactAdapterOmissionV1 => ({
  scope: {
    investigationId: investigation.investigationId,
    subjectId: investigation.subject.id,
    ...(source ? { sourceApplication: source } : {}),
    entityId: entity.id,
    ...(candidate.sourceProvenance?.nativeId
      ? { sourceNativeId: candidate.sourceProvenance.nativeId }
      : {}),
    canonicalEntityKind: entity.kind,
    ...(fieldId ? { fieldId } : {}),
  },
  sourceEntityId: entity.id,
  ...(candidate.sourceProvenance?.nativeId
    ? { sourceNativeId: candidate.sourceProvenance.nativeId }
    : {}),
  ...(fieldId ? { fieldId } : {}),
  sourceFieldName: candidate.sourceFieldName,
  reasonCode,
  reason,
  citationIds: candidate.citationIds ?? [],
  provenance: candidate.sourceProvenance,
});

const candidateDiagnostic = (
  code: FactAdapterDiagnosticV1["code"],
  message: string,
  entity: IntelligenceEntity,
  candidate: IntelligenceSourceFieldMetadata,
  source?: NonNullable<EngineeringProvenance["source"]>,
  fieldId?: string,
): FactAdapterDiagnosticV1 => ({
  code,
  message,
  ...(source ? { sourceApplication: source } : {}),
  sourceEntityId: entity.id,
  ...(candidate.sourceProvenance?.nativeId
    ? { sourceNativeId: candidate.sourceProvenance.nativeId }
    : {}),
  ...(fieldId ? { fieldId } : {}),
  sourceFieldName: candidate.sourceFieldName,
  provenance: candidate.sourceProvenance,
});

export function mapMetadataBackedFacts(
  investigation: EngineeringIntelligenceInvestigationV1,
  registeredFacts: readonly GenericFactV1[] = [],
  existingSourceCoverage: readonly SourceCoverageStatementV1[] = [],
): GenericFactAdapterResultV1 {
  const facts: GenericFactV1[] = [];
  const diagnostics: FactAdapterDiagnosticV1[] = [];
  const omissions: FactAdapterOmissionV1[] = [];
  const seenCandidates = new Set<string>();

  for (const entity of investigation.entities) {
    if (entity.assertion !== "fact") continue;

    for (const candidate of sourceFieldCandidates(entity)) {
      const source = candidate.sourceProvenance?.source;
      const recordKind = candidate.nativeRecordKind ?? entity.kind;
      const fieldId = candidate.sourceFieldName
        ? `metadata.${source ?? "unknown"}.${recordKind}.${candidate.sourceFieldName}`
        : undefined;

      if (!candidate.sourceFieldName.trim()) {
        const reason = "The source-field candidate has no source field name.";
        diagnostics.push(candidateDiagnostic(
          "unmapped-field",
          reason,
          entity,
          candidate,
          isSourceApplication(source) ? source : undefined,
        ));
        omissions.push(omission(
          investigation,
          entity,
          candidate,
          isSourceApplication(source) ? source : undefined,
          undefined,
          "unmapped-field",
          reason,
        ));
        continue;
      }

      if (!candidate.sourceProvenance) {
        const reason = "The source-field candidate did not preserve its own provenance.";
        diagnostics.push(candidateDiagnostic(
          "missing-provenance",
          reason,
          entity,
          candidate,
          undefined,
          fieldId,
        ));
        omissions.push(omission(
          investigation,
          entity,
          candidate,
          undefined,
          fieldId,
          "missing-provenance",
          reason,
        ));
        continue;
      }

      if (!isSourceApplication(source)) {
        const reasonCode = source ? "unsupported-source" : "missing-source-application";
        const reason = source
          ? "The field-level provenance has an unsupported source application."
          : "The field-level provenance has no source application.";
        diagnostics.push(candidateDiagnostic(
          reasonCode,
          reason,
          entity,
          candidate,
          undefined,
          fieldId,
        ));
        omissions.push(omission(
          investigation,
          entity,
          candidate,
          undefined,
          fieldId,
          reasonCode,
          reason,
        ));
        continue;
      }

      const sourceFieldId = `metadata.${source}.${recordKind}.${candidate.sourceFieldName}`;
      const candidateKey = stableCandidateKey(entity, source, candidate);
      if (seenCandidates.has(candidateKey)) continue;

      if (!candidate.sourceAuthority) {
        const reason = "The source-field candidate did not preserve its source authority.";
        diagnostics.push(candidateDiagnostic(
          "missing-source-authority",
          reason,
          entity,
          candidate,
          source,
          sourceFieldId,
        ));
        omissions.push(omission(
          investigation,
          entity,
          candidate,
          source,
          sourceFieldId,
          "missing-source-authority",
          reason,
        ));
        continue;
      }

      if (
        !hasOwn(candidate, "sourceValue") ||
        candidate.sourceValue === undefined
      ) {
        const reason = "The source-field candidate did not preserve an exact source value.";
        diagnostics.push(candidateDiagnostic(
          "source-value-unavailable",
          reason,
          entity,
          candidate,
          source,
          sourceFieldId,
        ));
        omissions.push(omission(
          investigation,
          entity,
          candidate,
          source,
          sourceFieldId,
          "source-value-unavailable",
          reason,
        ));
        continue;
      }

      const duplicateRegisteredFact = registeredFacts.some((fact) =>
        fact.sourceEntityId === entity.id &&
        fact.sourceApplication === source &&
        fact.sourceFieldName === candidate.sourceFieldName &&
        JSON.stringify(fact.exactSourceValue) === JSON.stringify(candidate.sourceValue) &&
        (candidate.candidateId === undefined ||
          (typeof fact.provenance === "object" &&
            fact.provenance !== null &&
            "candidateId" in fact.provenance &&
            fact.provenance.candidateId === candidate.candidateId)),
      );
      if (duplicateRegisteredFact) continue;

      const citedEvidence = [...new Set(candidate.citationIds ?? [])]
        .flatMap((citationId) => {
          const evidenceId = parseEvidenceId(citationId);
          const evidence = evidenceId
            ? investigation.evidence.find((item) => item.id === evidenceId)
            : undefined;
          return evidence &&
            sourceEvidenceSupportsCandidate(evidence, source, entity, candidate, sourceFieldId)
            ? [{ citationId, evidence }]
            : [];
        });
      const sourceValueTypeTag = sourceValueType(candidate.sourceValue);
      const transformations = candidate.sourceTransformations ?? [];
      const isDisplayNormalization = transformations.some(
        (transformation) => transformation.operation === "display-normalization",
      );
      const candidateIdentity = candidate.candidateId ??
        JSON.stringify([
          candidate.sourceProvenance.nativeId,
          candidate.sourceProvenance.artifactReference,
          candidate.sourceValue,
        ]);
      const fact: GenericFactV1 = {
        contractVersion: FACTUAL_EVIDENCE_CONTRACT_VERSION,
        factId: [
          "fact",
          encodeURIComponent(investigation.investigationId),
          encodeURIComponent(entity.id),
          encodeURIComponent(sourceFieldId),
          encodeURIComponent(candidate.sourceFieldName),
          encodeURIComponent(candidateIdentity),
        ].join(":"),
        investigationId: investigation.investigationId,
        subjectId: investigation.subject.id,
        sourceApplication: source,
        sourceEntityId: entity.id,
        ...(candidate.sourceProvenance.nativeId
          ? { sourceNativeId: candidate.sourceProvenance.nativeId }
          : {}),
        canonicalEntityKind: entity.kind,
        ...(candidate.nativeRecordKind
          ? { nativeRecordKind: candidate.nativeRecordKind }
          : {}),
        fieldId: sourceFieldId,
        sourceFieldName: candidate.sourceFieldName,
        displayLabel: candidate.sourceFieldName,
        factRole: "entity-attribute",
        exactSourceValue: candidate.sourceValue,
        sourceValueType: sourceValueTypeTag,
        valueType: sourceValueTypeTag,
        ...(isDisplayNormalization && candidate.displayValue !== undefined
          ? {
              normalizedValue: candidate.displayValue,
              normalizedValueType: sourceValueType(candidate.displayValue),
            }
          : {}),
        dimensions: factDimensions(candidate),
        observedAt: candidate.observedAt ?? candidate.sourceProvenance.observedAt,
        ...(candidate.extractedAt ? { extractedAt: candidate.extractedAt } : {}),
        ...(candidate.capturedAt ? { capturedAt: candidate.capturedAt } : {}),
        ...(candidate.effectiveAt ?? candidate.sourceScope?.effectiveAt
          ? { effectiveAt: candidate.effectiveAt ?? candidate.sourceScope?.effectiveAt }
          : {}),
        ...(candidate.validFrom ?? candidate.sourceScope?.validFrom
          ? { validFrom: candidate.validFrom ?? candidate.sourceScope?.validFrom }
          : {}),
        ...(candidate.validTo ?? candidate.sourceScope?.validTo
          ? { validTo: candidate.validTo ?? candidate.sourceScope?.validTo }
          : {}),
        freshness: candidate.freshness ?? "unknown",
        completeness: candidate.completeness ?? "unknown",
        derivationStatus: "raw",
        transformationTrace: transformations.map((transformation) => ({
          ruleId: transformation.ruleId,
          ruleVersion: transformation.ruleVersion,
          operation: transformation.operation,
          reversible: transformation.reversible,
        })),
        citationIds: citedEvidence.map(({ citationId }) => citationId),
        citationEligible: citedEvidence.length > 0,
        sourceAuthority: candidate.sourceAuthority,
        provenance: {
          entity: candidate.sourceProvenance,
          evidence: citedEvidence.map(({ evidence }) => ({
            id: evidence.id,
            provenance: evidence.provenance,
          })),
          sourceFieldName: candidate.sourceFieldName,
          ...(candidate.candidateId ? { candidateId: candidate.candidateId } : {}),
          ...(candidate.sourceScope ? { sourceScope: candidate.sourceScope } : {}),
          ...(candidate.sourceAdapterMetadata
            ? { sourceAdapterMetadata: candidate.sourceAdapterMetadata }
            : {}),
          ...(candidate.citationLinkageOrigin
            ? { citationLinkageOrigin: candidate.citationLinkageOrigin }
            : {}),
        },
      };
      const validation = validateGenericFactV1(fact);
      if (!validation.valid) {
        diagnostics.push(...validation.diagnostics);
        const reasonCode = validation.diagnostics[0]?.code ?? "source-value-unavailable";
        const reason = "The metadata-backed fact does not satisfy the factual evidence contract.";
        omissions.push(omission(
          investigation,
          entity,
          candidate,
          source,
          sourceFieldId,
          reasonCode,
          reason,
        ));
        continue;
      }

      facts.push(validation.fact);
      seenCandidates.add(candidateKey);
    }
  }

  const existingCoverageKeys = new Set(existingSourceCoverage.map((coverage) =>
    `${coverage.sourceApplication}::${coverage.sourceEntityId ?? ""}`,
  ));
  const sourceCoverage: SourceCoverageStatementV1[] = investigation.sources
    .filter((source) =>
      isSourceApplication(source.source) &&
      !existingCoverageKeys.has(`${source.source}::${source.entityId}`),
    )
    .map((source) => {
      const evidence = investigation.evidence.filter((item) =>
        item.source === source.source &&
        ((item.provenance.artifactReference === source.entityId) ||
          Boolean(
            source.provenance.nativeId &&
            item.provenance.nativeId === source.provenance.nativeId,
          )) &&
        !(source.provenance.nativeId &&
          item.provenance.nativeId &&
          source.provenance.nativeId !== item.provenance.nativeId),
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
        ...(source.status === "available" ? {} : { reasonCode: `source-${source.status}` }),
      };
    });

  return {
    facts,
    sourceCoverage,
    diagnostics,
    omissions,
  };
}
