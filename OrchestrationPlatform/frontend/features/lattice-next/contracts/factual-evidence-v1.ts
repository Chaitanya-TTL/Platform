import type {
  CitationLinkageOriginV1,
  EngineeringProvenance,
  IntelligenceAuthority,
  IntelligenceSourceScope,
  TemporalContext,
} from "./intelligence-v1";
 
export const FACTUAL_EVIDENCE_CONTRACT_VERSION = "1.0" as const;
 
export type FactValueTypeV1 =
  | "scalar"
  | "text"
  | "boolean"
  | "date"
  | "status"
  | "identifier"
  | "quantity"
  | "money"
  | "list"
  | "structured";
 
export type GenericFactRoleV1 =
  | "entity-identity"
  | "entity-attribute"
  | "metric"
  | "transaction"
  | "transaction-delta"
  | "snapshot-balance"
  | "derived-value";
 
export type FactCompletenessV1 = "complete" | "partial" | "unknown" | "not-applicable";
export type FactDerivationStatusV1 = "raw" | "normalized" | "fallback" | "derived";
export type SourceCoverageStatusV1 =
  | "available"
  | "partial"
  | "unavailable"
  | "failed"
  | "cancelled"
  | "timed-out"
  | "capability-limited"
  | "not-observed";

export type SourceOperationStatusV1 =
  | "requested"
  | "running"
  | "succeeded"
  | "partial"
  | "empty"
  | "failed"
  | "timed-out"
  | "cancelled"
  | "unavailable"
  | "not-observed";
 
export type FactDimensionV1 = {
  dimensionId: string;
  label: string;
  exactValue: unknown;
  valueType: FactValueTypeV1;
  unit?: string;
};
 
export type FactTransformationV1 = {
  ruleId: string;
  ruleVersion: string;
  operation: string;
  inputType?: string;
  outputType?: string;
  reversible: boolean;
};

export type FactSourceProvenanceV1 =
  | EngineeringProvenance
  | {
      entity?: EngineeringProvenance;
      source?: EngineeringProvenance;
      evidence: readonly { id: string; provenance: EngineeringProvenance }[];
      sourceFieldName: string;
      candidateId?: string;
      sourceScope?: IntelligenceSourceScope;
      sourceAdapterMetadata?: {
        adapterId: string;
        schemaVersion: string;
        metadata?: unknown;
      };
      citationLinkageOrigin?: CitationLinkageOriginV1;
    };
 
export type GenericFactV1 = {
  contractVersion: typeof FACTUAL_EVIDENCE_CONTRACT_VERSION;
  factId: string;
  investigationId: string;
  investigationRevision?: number;
  subjectId?: string;
  sourceApplication: string;
  sourceEntityId: string;
  sourceNativeId?: string;
  canonicalEntityKind: string;
  nativeRecordKind?: string;
  fieldId: string;
  sourceFieldName: string;
  displayLabel: string;
  factRole: GenericFactRoleV1;
  exactSourceValue: unknown;
  sourceValueType: FactValueTypeV1;
  valueType: FactValueTypeV1;
  normalizedValue?: unknown;
  normalizedValueType?: FactValueTypeV1;
  unit?: string;
  currency?: string;
  precision?: number;
  dimensions: readonly FactDimensionV1[];
  evidenceIds?: readonly string[];
  observedAt?: string;
  extractedAt?: string;
  capturedAt?: string;
  effectiveAt?: string;
  validFrom?: string;
  validTo?: string;
  freshness: TemporalContext["freshness"];
  completeness: FactCompletenessV1;
  derivationStatus: FactDerivationStatusV1;
  derivationRuleId?: string;
  transformationTrace: readonly FactTransformationV1[];
  citationIds: readonly string[];
  citationEligible: boolean;
  sourceAuthority: IntelligenceAuthority;
  provenance: FactSourceProvenanceV1;
};

export type EngineeringFactEvidenceV1 = Omit<GenericFactV1, "provenance"> & {
  snapshotRevision: number;
  evidenceIds: readonly string[];
  authorizationDecisionId: string;
  provenance: EngineeringProvenance;
};

export type ApplicationParticipationEvidenceV1 = {
  contractVersion: typeof FACTUAL_EVIDENCE_CONTRACT_VERSION;
  candidateId: string;
  investigationId: string;
  snapshotRevision: number;
  sourceApplication: string;
  canonicalEntityIds: readonly string[];
  sourceOperation: string;
  sourceOperationStatus: SourceOperationStatusV1;
  completeness: FactCompletenessV1;
  capturedAt?: string;
  evidenceIds: readonly string[];
  citationIds: readonly string[];
  citationEligible: boolean;
  sourceAuthority: IntelligenceAuthority;
  provenance: EngineeringProvenance;
  authorizationDecisionId: string;
};

export type ApplicationParticipationCandidateV1 =
  Omit<ApplicationParticipationEvidenceV1, "authorizationDecisionId">;
 
export type FactRequestScopeV1 = {
  investigationId?: string;
  subjectId?: string;
  sourceApplication?: string;
  entityId?: string;
  sourceNativeId?: string;
  canonicalEntityKind?: string;
  fieldId?: string;
  dimensionIds?: readonly string[];
};
 
export type SourceCoverageStatementV1 = {
  contractVersion: typeof FACTUAL_EVIDENCE_CONTRACT_VERSION;
  investigationId: string;
  subjectId?: string;
  sourceApplication: string;
  sourceEntityId?: string;
  status: SourceCoverageStatusV1;
  completeness: FactCompletenessV1;
  requestedScope?: FactRequestScopeV1;
  returnedScope?: FactRequestScopeV1;
  observedAt?: string;
  citationIds: readonly string[];
  citationEligible: boolean;
  sourceAuthority: IntelligenceAuthority;
  provenance: EngineeringProvenance;
  reasonCode?: string;
};
 
export type FactAdapterDiagnosticCodeV1 =
  | "snapshot-not-accepted"
  | "invalid-contract-version"
  | "missing-fact-id"
  | "missing-investigation-id"
  | "missing-source-application"
  | "missing-source-entity-id"
  | "missing-canonical-entity-kind"
  | "missing-field-id"
  | "missing-source-field-name"
  | "missing-display-label"
  | "missing-exact-source-value"
  | "invalid-value-type"
  | "invalid-dimensions"
  | "invalid-freshness"
  | "invalid-completeness"
  | "invalid-derivation-status"
  | "invalid-transformation-trace"
  | "invalid-citation-ids"
  | "invalid-citation-linkage"
  | "missing-source-authority"
  | "missing-provenance"
  | "invalid-provenance"
  | "source-authority-mismatch"
  | "invalid-snapshot-revision"
  | "missing-evidence-id"
  | "missing-authorization-binding"
  | "missing-citation"
  | "unsupported-source"
  | "unmapped-entity"
  | "unmapped-field"
  | "unsupported-value-type"
  | "source-value-unavailable"
  | "source-coverage-incomplete"
  | "fact-conflict";
 
export type FactCitationLinkageOriginV1 = CitationLinkageOriginV1;
 
export type FactAdapterDiagnosticV1 = {
  code: FactAdapterDiagnosticCodeV1;
  message: string;
  factId?: string;
  sourceApplication?: string;
  sourceEntityId?: string;
  sourceNativeId?: string;
  fieldId?: string;
  sourceFieldName?: string;
  citationIds?: readonly string[];
  citationLinkageOrigin?: FactCitationLinkageOriginV1;
  provenance?: FactSourceProvenanceV1;
};
 
export type FactAdapterOmissionV1 = {
  scope: FactRequestScopeV1;
  sourceEntityId?: string;
  sourceNativeId?: string;
  fieldId?: string;
  sourceFieldName?: string;
  reasonCode: FactAdapterDiagnosticCodeV1;
  reason: string;
  citationIds: readonly string[];
  citationLinkageOrigin?: FactCitationLinkageOriginV1;
  provenance?: FactSourceProvenanceV1;
};
 
export type FactRepresentationValidationV1 =
  | { valid: true; fact: GenericFactV1 }
  | { valid: false; diagnostics: readonly FactAdapterDiagnosticV1[] };

export type EngineeringFactEvidenceValidationV1 =
  | { valid: true; fact: EngineeringFactEvidenceV1 }
  | { valid: false; diagnostics: readonly FactAdapterDiagnosticV1[] };

export type ApplicationParticipationValidationV1 =
  | { valid: true; participation: ApplicationParticipationEvidenceV1 }
  | { valid: false; diagnostics: readonly FactAdapterDiagnosticV1[] };
 
export type FactRetrievalOutcomeV1 =
  | { status: "fact-found"; fact: GenericFactV1 }
  | {
      status: "multiple-compatible-facts";
      facts: readonly GenericFactV1[];
      scope: FactRequestScopeV1;
      reasonCode?: string;
    }
  | {
      status: "safe-aggregate";
      fact: GenericFactV1;
      inputs: readonly GenericFactV1[];
      operation: string;
      ruleId: string;
      ruleVersion: string;
    }
  | {
      status: "incompatible-facts";
      facts: readonly GenericFactV1[];
      scope: FactRequestScopeV1;
      reasonCode: string;
    }
  | {
      status: "ambiguous-entity";
      candidates: readonly GenericFactV1[];
      scope: FactRequestScopeV1;
      reasonCode: string;
    }
  | {
      status: "ambiguous-field";
      candidates: readonly GenericFactV1[];
      scope: FactRequestScopeV1;
      reasonCode: string;
    }
  | {
      status: "fact-unavailable";
      scope: FactRequestScopeV1;
      reasonCode: string;
      coverage?: readonly SourceCoverageStatementV1[];
    }
  | {
      status: "fact-stale";
      facts: readonly GenericFactV1[];
      reasonCode: string;
    }
  | {
      status: "fact-conflicting";
      facts: readonly GenericFactV1[];
      reasonCode: string;
    }
  | {
      status: "fact-omitted-during-projection";
      factIds: readonly string[];
      scope: FactRequestScopeV1;
      firstLossStage: string;
      sourceFactExisted: boolean;
      citationExisted: boolean;
      reasonCode: string;
    }
  | {
      status: "unsupported-fact-representation";
      scope: FactRequestScopeV1;
      diagnostics: readonly FactAdapterDiagnosticV1[];
      facts?: readonly GenericFactV1[];
    };
 
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
 
const hasNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
 
const VALUE_TYPES: readonly FactValueTypeV1[] = [
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
];
 
const AUTHORITIES: readonly IntelligenceAuthority[] = [
  "source-authoritative",
  "backend-derived",
  "frontend-derived",
  "poc-synthetic",
  "hardcoded",
  "mocked",
  "unavailable",
];
 
const FRESHNESS_VALUES: readonly TemporalContext["freshness"][] = [
  "current",
  "stale",
  "unknown",
  "not-applicable",
];
 
const COMPLETENESS_VALUES: readonly FactCompletenessV1[] = [
  "complete",
  "partial",
  "unknown",
  "not-applicable",
];
 
const DERIVATION_STATUSES: readonly FactDerivationStatusV1[] = [
  "raw",
  "normalized",
  "fallback",
  "derived",
];

const isEngineeringProvenance = (value: unknown): value is EngineeringProvenance =>
  isRecord(value) &&
  hasNonEmptyString(value.provider) &&
  typeof value.observedAt === "string" &&
  !Number.isNaN(Date.parse(value.observedAt)) &&
  AUTHORITIES.includes(value.authority as IntelligenceAuthority) &&
  (value.source === undefined || hasNonEmptyString(value.source));

const isFactSourceProvenance = (value: unknown): value is FactSourceProvenanceV1 =>
  isEngineeringProvenance(value) ||
  (isRecord(value) &&
    (value.entity === undefined || isEngineeringProvenance(value.entity)) &&
    (value.source === undefined || isEngineeringProvenance(value.source)) &&
    (isEngineeringProvenance(value.entity) || isEngineeringProvenance(value.source)) &&
    hasNonEmptyString(value.sourceFieldName) &&
    Array.isArray(value.evidence) &&
    value.evidence.every((item) =>
      isRecord(item) && hasNonEmptyString(item.id) && isEngineeringProvenance(item.provenance)));

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => hasNonEmptyString(item));
 
export function validateGenericFactV1(value: unknown): FactRepresentationValidationV1 {
  if (!isRecord(value)) {
    return {
      valid: false,
      diagnostics: [{ code: "unsupported-value-type", message: "Fact must be an object." }],
    };
  }
 
  const diagnostics: FactAdapterDiagnosticV1[] = [];
  const add = (code: FactAdapterDiagnosticCodeV1, message: string) => diagnostics.push({ code, message });
 
  if (value.contractVersion !== FACTUAL_EVIDENCE_CONTRACT_VERSION) {
    add("invalid-contract-version", "Fact contract version is missing or unsupported.");
  }
  if (!hasNonEmptyString(value.factId)) add("missing-fact-id", "Fact ID is required.");
  if (!hasNonEmptyString(value.investigationId)) add("missing-investigation-id", "Investigation ID is required.");
  if (!hasNonEmptyString(value.sourceApplication)) {
    add("missing-source-application", "Source application is required.");
  }
  if (!hasNonEmptyString(value.sourceEntityId)) {
    add("missing-source-entity-id", "Source entity ID is required.");
  }
  if (!hasNonEmptyString(value.canonicalEntityKind)) {
    add("missing-canonical-entity-kind", "Canonical entity kind is required.");
  }
  if (!hasNonEmptyString(value.fieldId)) add("missing-field-id", "Field ID is required.");
  if (!hasNonEmptyString(value.sourceFieldName)) {
    add("missing-source-field-name", "Source field name is required.");
  }
  if (!hasNonEmptyString(value.displayLabel)) add("missing-display-label", "Display label is required.");
  if (!Object.prototype.hasOwnProperty.call(value, "exactSourceValue") ||
      value.exactSourceValue === undefined) {
    add("missing-exact-source-value", "Exact source value must be preserved.");
  }
  if (!VALUE_TYPES.includes(value.sourceValueType as FactValueTypeV1) ||
      !VALUE_TYPES.includes(value.valueType as FactValueTypeV1)) {
    add("invalid-value-type", "Source and declared value types must be supported.");
  }
  if (!Array.isArray(value.dimensions) || value.dimensions.some((dimension) =>
    !isRecord(dimension) ||
    !hasNonEmptyString(dimension.dimensionId) ||
    !hasNonEmptyString(dimension.label) ||
    !Object.prototype.hasOwnProperty.call(dimension, "exactValue") ||
    !VALUE_TYPES.includes(dimension.valueType as FactValueTypeV1),
  )) {
    add("invalid-dimensions", "Dimensions must have registered identity, value, and type.");
  }
  if (!FRESHNESS_VALUES.includes(value.freshness as TemporalContext["freshness"])) {
    add("invalid-freshness", "Freshness must use a supported value.");
  }
  if (!COMPLETENESS_VALUES.includes(value.completeness as FactCompletenessV1)) {
    add("invalid-completeness", "Completeness must use a supported value.");
  }
  if (!DERIVATION_STATUSES.includes(value.derivationStatus as FactDerivationStatusV1)) {
    add("invalid-derivation-status", "Derivation status must use a supported value.");
  }
  if (!Array.isArray(value.transformationTrace) || value.transformationTrace.some((step) =>
    !isRecord(step) ||
    !hasNonEmptyString(step.ruleId) ||
    !hasNonEmptyString(step.ruleVersion) ||
    !hasNonEmptyString(step.operation) ||
    typeof step.reversible !== "boolean",
  )) {
    add("invalid-transformation-trace", "Transformation trace must contain versioned steps.");
  }
  if (!Array.isArray(value.citationIds) || value.citationIds.some((citationId) =>
    !hasNonEmptyString(citationId),
  )) {
    add("invalid-citation-ids", "Citation IDs must be a string array.");
  }
  if (!AUTHORITIES.includes(value.sourceAuthority as IntelligenceAuthority)) {
    add("missing-source-authority", "Source authority must use an existing authority value.");
  }
  if (!isFactSourceProvenance(value.provenance)) {
    add("invalid-provenance", "Fact provenance must identify its source field and source records.");
  }
  if (typeof value.citationEligible !== "boolean") {
    add("missing-citation", "Citation eligibility must be explicit.");
  } else if (value.citationEligible && Array.isArray(value.citationIds) &&
      value.citationIds.length === 0) {
    add("missing-citation", "An eligible fact must preserve at least one citation ID.");
  }
  if (value.normalizedValue !== undefined &&
      !VALUE_TYPES.includes(value.normalizedValueType as FactValueTypeV1)) {
    add("invalid-value-type", "A normalized value requires a supported normalized value type.");
  }
  if (value.derivationStatus === "derived" && !hasNonEmptyString(value.derivationRuleId)) {
    add("invalid-derivation-status", "Derived facts require a derivation rule ID.");
  }
 
  return diagnostics.length
    ? { valid: false, diagnostics }
    : { valid: true, fact: value as unknown as GenericFactV1 };
}

export function validateEngineeringFactEvidenceV1(
  value: unknown,
): EngineeringFactEvidenceValidationV1 {
  const representation = validateGenericFactV1(value);
  if (!representation.valid) return representation;
  if (!isRecord(value)) {
    return {
      valid: false,
      diagnostics: [{ code: "unsupported-value-type", message: "Fact must be an object." }],
    };
  }

  const diagnostics: FactAdapterDiagnosticV1[] = [];
  if (!Number.isInteger(value.snapshotRevision) || (value.snapshotRevision as number) < 0) {
    diagnostics.push({
      code: "invalid-snapshot-revision",
      message: "A non-negative accepted snapshot revision is required.",
    });
  }
  if (!isStringArray(value.evidenceIds) || value.evidenceIds.length === 0) {
    diagnostics.push({
      code: "missing-evidence-id",
      message: "At least one source evidence ID is required.",
    });
  }
  if (!hasNonEmptyString(value.authorizationDecisionId)) {
    diagnostics.push({
      code: "missing-authorization-binding",
      message: "A runtime authorization decision binding is required.",
    });
  }
  if (!isEngineeringProvenance(value.provenance)) {
    diagnostics.push({
      code: "invalid-provenance",
      message: "Runtime fact evidence requires typed source provenance.",
    });
  }
  if (isEngineeringProvenance(value.provenance) &&
      value.provenance.authority !== value.sourceAuthority) {
    diagnostics.push({
      code: "source-authority-mismatch",
      message: "Fact authority must match its source provenance.",
    });
  }

  return diagnostics.length
    ? { valid: false, diagnostics }
    : { valid: true, fact: value as unknown as EngineeringFactEvidenceV1 };
}

export function validateApplicationParticipationV1(
  value: unknown,
): ApplicationParticipationValidationV1 {
  if (!isRecord(value)) {
    return {
      valid: false,
      diagnostics: [{
        code: "unsupported-value-type",
        message: "Application participation must be an object.",
      }],
    };
  }

  const diagnostics: FactAdapterDiagnosticV1[] = [];
  if (value.contractVersion !== FACTUAL_EVIDENCE_CONTRACT_VERSION) {
    diagnostics.push({
      code: "invalid-contract-version",
      message: "Application participation contract version is missing or unsupported.",
    });
  }
  if (!hasNonEmptyString(value.candidateId)) {
    diagnostics.push({ code: "missing-fact-id", message: "Participation candidate ID is required." });
  }
  if (!hasNonEmptyString(value.investigationId)) {
    diagnostics.push({
      code: "missing-investigation-id",
      message: "Investigation ID is required.",
    });
  }
  if (!Number.isInteger(value.snapshotRevision) || (value.snapshotRevision as number) < 0) {
    diagnostics.push({
      code: "invalid-snapshot-revision",
      message: "A non-negative accepted snapshot revision is required.",
    });
  }
  if (!hasNonEmptyString(value.sourceApplication)) {
    diagnostics.push({
      code: "missing-source-application",
      message: "Source application is required.",
    });
  }
  if (!isStringArray(value.canonicalEntityIds) || value.canonicalEntityIds.length === 0) {
    diagnostics.push({
      code: "unmapped-entity",
      message: "Participation must link to at least one canonical entity.",
    });
  }
  if (!hasNonEmptyString(value.sourceOperation) ||
      !["requested", "running", "succeeded", "partial", "empty", "failed",
        "timed-out", "cancelled", "unavailable", "not-observed"].includes(
        value.sourceOperationStatus as string,
      )) {
    diagnostics.push({
      code: "source-coverage-incomplete",
      message: "Participation source operation and status are required.",
    });
  }
  if (!COMPLETENESS_VALUES.includes(value.completeness as FactCompletenessV1)) {
    diagnostics.push({
      code: "invalid-completeness",
      message: "Participation completeness must use a supported value.",
    });
  }
  if (!isStringArray(value.evidenceIds) || value.evidenceIds.length === 0) {
    diagnostics.push({
      code: "missing-evidence-id",
      message: "At least one source evidence ID is required.",
    });
  }
  if (!isStringArray(value.citationIds) || value.citationIds.length === 0) {
    diagnostics.push({
      code: "missing-citation",
      message: "At least one source citation ID is required.",
    });
  }
  if (typeof value.citationEligible !== "boolean") {
    diagnostics.push({
      code: "missing-citation",
      message: "Citation eligibility must be explicit.",
    });
  }
  if (!AUTHORITIES.includes(value.sourceAuthority as IntelligenceAuthority)) {
    diagnostics.push({
      code: "missing-source-authority",
      message: "Source authority must use an existing authority value.",
    });
  }
  if (!isEngineeringProvenance(value.provenance)) {
    diagnostics.push({
      code: "missing-provenance",
      message: "Typed source provenance is required.",
    });
  } else if (value.provenance.authority !== value.sourceAuthority) {
    diagnostics.push({
      code: "source-authority-mismatch",
      message: "Participation authority must match its source provenance.",
    });
  }
  if (!hasNonEmptyString(value.authorizationDecisionId)) {
    diagnostics.push({
      code: "missing-authorization-binding",
      message: "A runtime authorization decision binding is required.",
    });
  }

  return diagnostics.length
    ? { valid: false, diagnostics }
    : { valid: true, participation: value as unknown as ApplicationParticipationEvidenceV1 };
}