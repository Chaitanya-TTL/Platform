import { validateGenericFactV1 } from "../../contracts/factual-evidence-v1";
import type {
  FactAdapterDiagnosticV1,
  FactRequestScopeV1,
  FactRetrievalOutcomeV1,
  GenericFactV1,
  SourceCoverageStatementV1,
} from "../../contracts/factual-evidence-v1";

export type FactFieldRegistrationV1 = {
  fieldId: string;
  aliases: readonly string[];
  expectedValueType?: GenericFactV1["valueType"];
  citationRequired?: boolean;
};

export type FactDiscoveryConstraintsV1 = FactRequestScopeV1 & {
  sourceFieldName?: string;
  dimensions?: readonly { dimensionId: string; exactValue: unknown }[];
};

export type FactProjectionOmissionV1 = {
  scope: FactRequestScopeV1;
  factIds: readonly string[];
  firstLossStage: string;
  sourceFactExisted: boolean;
  citationExisted: boolean;
  reasonCode: string;
};

export type FactDiscoveryEvidenceV1 = {
  sourceCoverage?: readonly SourceCoverageStatementV1[];
  projectionOmissions?: readonly FactProjectionOmissionV1[];
};

const sameValue = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" ||
      typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameValue(value, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) =>
      key === rightKeys[index] && sameValue(leftRecord[key], rightRecord[key]),
    );
};

const scopeFor = (constraints: FactDiscoveryConstraintsV1): FactRequestScopeV1 => ({
  investigationId: constraints.investigationId,
  subjectId: constraints.subjectId,
  sourceApplication: constraints.sourceApplication,
  entityId: constraints.entityId,
  sourceNativeId: constraints.sourceNativeId,
  canonicalEntityKind: constraints.canonicalEntityKind,
  fieldId: constraints.fieldId,
  dimensionIds: constraints.dimensionIds,
});

const matchesScope = (
  fact: GenericFactV1,
  constraints: FactDiscoveryConstraintsV1,
): boolean =>
  (constraints.investigationId === undefined ||
    fact.investigationId === constraints.investigationId) &&
  (constraints.subjectId === undefined || fact.subjectId === constraints.subjectId) &&
  (constraints.sourceApplication === undefined ||
    fact.sourceApplication === constraints.sourceApplication) &&
  (constraints.entityId === undefined || fact.sourceEntityId === constraints.entityId) &&
  (constraints.sourceNativeId === undefined ||
    fact.sourceNativeId === constraints.sourceNativeId) &&
  (constraints.canonicalEntityKind === undefined ||
    fact.canonicalEntityKind === constraints.canonicalEntityKind) &&
  (constraints.fieldId === undefined || fact.fieldId === constraints.fieldId) &&
  (constraints.dimensionIds ?? []).every((dimensionId) =>
    fact.dimensions.some((dimension) => dimension.dimensionId === dimensionId),
  ) &&
  (constraints.dimensions ?? []).every((dimension) =>
    fact.dimensions.some((candidate) =>
      candidate.dimensionId === dimension.dimensionId &&
      sameValue(candidate.exactValue, dimension.exactValue),
    ),
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);

const matchesIdentityScope = (
    value: unknown,
    constraints: FactDiscoveryConstraintsV1,
    registration?: FactFieldRegistrationV1,
): boolean => {
    if (!isRecord(value)) return true;
    const expected: Record<string, string | undefined> = {
      investigationId: constraints.investigationId,
      subjectId: constraints.subjectId,
      sourceApplication: constraints.sourceApplication,
      sourceEntityId: constraints.entityId,
      sourceNativeId: constraints.sourceNativeId,
      canonicalEntityKind: constraints.canonicalEntityKind,
      fieldId: constraints.fieldId ?? registration?.fieldId,
      sourceFieldName: constraints.sourceFieldName,
    };
    return Object.entries(expected).every(([key, selector]) =>
      selector === undefined || value[key] === undefined || value[key] === selector,
    );
};

const fieldRegistration = (
  constraints: FactDiscoveryConstraintsV1,
  registry: readonly FactFieldRegistrationV1[],
): FactFieldRegistrationV1 | undefined => {
  if (constraints.fieldId) {
    const field = registry.find((candidate) => candidate.fieldId === constraints.fieldId);
    if (constraints.sourceFieldName &&
        !field?.aliases.includes(constraints.sourceFieldName)) return undefined;
    return field;
  }
  if (constraints.sourceFieldName) {
    return registry.find((field) => field.aliases.includes(constraints.sourceFieldName!));
  }
  return undefined;
};

const authorityRank: Record<GenericFactV1["sourceAuthority"], number> = {
  "source-authoritative": 7,
  "backend-derived": 6,
  "frontend-derived": 5,
  "poc-synthetic": 4,
  hardcoded: 3,
  mocked: 2,
  unavailable: 1,
};

const freshnessRank: Record<GenericFactV1["freshness"], number> = {
  current: 4,
  unknown: 3,
  "not-applicable": 2,
  stale: 1,
};

const completenessRank: Record<GenericFactV1["completeness"], number> = {
  complete: 4,
  partial: 3,
  unknown: 2,
  "not-applicable": 1,
};

const rank = (
  fact: GenericFactV1,
  constraints: FactDiscoveryConstraintsV1,
  registration: FactFieldRegistrationV1 | undefined,
): readonly number[] => [
  Number(constraints.subjectId !== undefined && fact.subjectId === constraints.subjectId),
  Number(constraints.sourceApplication !== undefined &&
    fact.sourceApplication === constraints.sourceApplication),
  Number((constraints.entityId !== undefined && fact.sourceEntityId === constraints.entityId) ||
    (constraints.sourceNativeId !== undefined &&
      fact.sourceNativeId === constraints.sourceNativeId)),
  Number(constraints.fieldId !== undefined && fact.fieldId === constraints.fieldId),
  Number(constraints.sourceFieldName !== undefined &&
    registration?.aliases.includes(constraints.sourceFieldName) === true),
  authorityRank[fact.sourceAuthority],
  freshnessRank[fact.freshness],
  completenessRank[fact.completeness],
  Number(fact.citationEligible),
];

const compareRanks = (left: readonly number[], right: readonly number[]): number => {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return right[index] - left[index];
  }
  return 0;
};

const matchesProjectionOmission = (
  omission: FactProjectionOmissionV1,
  constraints: FactDiscoveryConstraintsV1,
): boolean => Object.entries(constraints).every(([key, value]) => {
  if (key === "sourceFieldName" || key === "dimensions" || value === undefined) return true;
  if (key === "fieldId") return omission.scope.fieldId === value;
  return omission.scope[key as keyof FactRequestScopeV1] === value;
});

const matchesCoverage = (
  coverage: SourceCoverageStatementV1,
  constraints: FactDiscoveryConstraintsV1,
): boolean =>
  (constraints.investigationId === undefined ||
    coverage.investigationId === constraints.investigationId) &&
  (constraints.subjectId === undefined || coverage.subjectId === constraints.subjectId) &&
  (constraints.sourceApplication === undefined ||
    coverage.sourceApplication === constraints.sourceApplication) &&
  (constraints.entityId === undefined || coverage.sourceEntityId === constraints.entityId);

export function discoverStructuredFacts(
  facts: readonly GenericFactV1[],
  constraints: FactDiscoveryConstraintsV1,
  registry: readonly FactFieldRegistrationV1[],
  evidence: FactDiscoveryEvidenceV1 = {},
): FactRetrievalOutcomeV1 {
  const scope = scopeFor(constraints);
  const registration = fieldRegistration(constraints, registry);
  if ((constraints.fieldId || constraints.sourceFieldName) && !registration) {
    const diagnostic: FactAdapterDiagnosticV1 = {
      code: "unmapped-field",
      message: "The requested field is not registered.",
      sourceApplication: constraints.sourceApplication,
      sourceEntityId: constraints.entityId,
      fieldId: constraints.fieldId,
      sourceFieldName: constraints.sourceFieldName,
    };
    return { status: "unsupported-fact-representation", scope, diagnostics: [diagnostic] };
  }

  const scopedFacts = facts.filter((fact) =>
    matchesIdentityScope(fact, constraints, registration),
  );
  const invalidFacts = scopedFacts.map((fact) => ({
    fact,
    validation: validateGenericFactV1(fact),
  })).filter((candidate) => !candidate.validation.valid);
  if (invalidFacts.length) {
    const invalidFactSet = new Set(invalidFacts.map((candidate) => candidate.fact));
    return {
      status: "unsupported-fact-representation",
      scope,
      facts: scopedFacts.filter((fact) => !invalidFactSet.has(fact)),
      diagnostics: invalidFacts.flatMap((candidate) =>
        candidate.validation.valid ? [] : candidate.validation.diagnostics,
      ),
    };
  }

  const candidates = scopedFacts.filter((fact) =>
    matchesScope(fact, constraints) &&
    (!constraints.sourceFieldName || registration?.fieldId === fact.fieldId),
  );

  if (!candidates.length) {
    const projectionOmission = evidence.projectionOmissions?.find((omission) =>
      matchesProjectionOmission(omission, constraints),
    );
    if (projectionOmission) {
      return {
        status: "fact-omitted-during-projection",
        factIds: projectionOmission.factIds,
        scope,
        firstLossStage: projectionOmission.firstLossStage,
        sourceFactExisted: projectionOmission.sourceFactExisted,
        citationExisted: projectionOmission.citationExisted,
        reasonCode: projectionOmission.reasonCode,
      };
    }

    const coverage = (evidence.sourceCoverage ?? []).filter((item) =>
      matchesCoverage(item, constraints),
    );
    const unavailableCoverage = coverage.find((item) => item.status !== "available");
    return {
      status: "fact-unavailable",
      scope,
      reasonCode: unavailableCoverage
        ? `source-${unavailableCoverage.status}`
        : "no-matching-fact",
      coverage,
    };
  }

  const orderedCandidates = [...candidates].sort((left, right) =>
    left.sourceFieldName.localeCompare(right.sourceFieldName) ||
    left.factId.localeCompare(right.factId),
  );
  if (registration?.expectedValueType &&
      orderedCandidates.some((fact) => fact.valueType !== registration.expectedValueType)) {
    return {
      status: "unsupported-fact-representation",
      scope,
      facts: orderedCandidates,
      diagnostics: [{
        code: "unsupported-value-type",
        message: "The source value does not use the registered structured representation.",
        sourceApplication: constraints.sourceApplication,
        sourceEntityId: constraints.entityId,
        fieldId: registration.fieldId,
        sourceFieldName: constraints.sourceFieldName,
      }],
    };
  }
  const fields = new Set(orderedCandidates.map((fact) => fact.fieldId));
  if (!constraints.fieldId && !constraints.sourceFieldName && fields.size > 1) {
    return {
      status: "ambiguous-field",
      candidates: orderedCandidates,
      scope,
      reasonCode: "multiple-registered-fields",
    };
  }

  const entityIds = new Set(orderedCandidates.map((fact) => fact.sourceEntityId));
  if (!constraints.entityId && !constraints.sourceNativeId && entityIds.size > 1) {
    return {
      status: "ambiguous-entity",
      candidates: orderedCandidates,
      scope,
      reasonCode: "multiple-source-entities",
    };
  }

  const firstFact = orderedCandidates[0];
  const entityIdentityKey = (fact: GenericFactV1) => JSON.stringify([
    fact.investigationId,
    fact.subjectId ?? null,
    fact.sourceApplication,
    fact.sourceEntityId,
    fact.sourceNativeId ?? null,
    fact.canonicalEntityKind,
    fact.fieldId,
  ]);
  if (new Set(orderedCandidates.map(entityIdentityKey)).size > 1) {
    return {
      status: "incompatible-facts",
      facts: orderedCandidates,
      scope,
      reasonCode: "incompatible-entity-identity",
    };
  }

  const dimensionKey = (fact: GenericFactV1) => [...fact.dimensions]
    .sort((left, right) => left.dimensionId.localeCompare(right.dimensionId))
    .map(({ dimensionId, exactValue, valueType, unit }) => ({
      dimensionId,
      exactValue,
      valueType,
      unit,
    }));
  const sameDimensions = orderedCandidates.every((fact) =>
    sameValue(dimensionKey(fact), dimensionKey(firstFact)),
  );
  if (!sameDimensions) {
    return {
      status: "incompatible-facts",
      facts: orderedCandidates,
      scope,
      reasonCode: "incompatible-dimensions",
    };
  }

  const temporalScopeKey = (fact: GenericFactV1) => JSON.stringify([
    fact.investigationRevision ?? null,
    fact.observedAt ?? null,
    fact.effectiveAt ?? null,
    fact.validFrom ?? null,
    fact.validTo ?? null,
  ]);
  if (new Set(orderedCandidates.map(temporalScopeKey)).size > 1) {
    return {
      status: "incompatible-facts",
      facts: orderedCandidates,
      scope,
      reasonCode: "incompatible-temporal-scope",
    };
  }

  const sameExactValue = orderedCandidates.every((fact) =>
    sameValue(fact.exactSourceValue, firstFact.exactSourceValue),
  );
  const displayNormalizationKey = (fact: GenericFactV1) =>
    fact.transformationTrace
      .filter((transformation) =>
        transformation.operation === "display-normalization",
      )
      .map((transformation) => `${transformation.ruleId}:${transformation.ruleVersion}`)
      .sort()
      .join("|");
  const sameDisplayNormalization = orderedCandidates.every((fact) =>
    fact.normalizedValue !== undefined &&
    fact.normalizedValueType === firstFact.normalizedValueType &&
    sameValue(fact.normalizedValue, firstFact.normalizedValue) &&
    displayNormalizationKey(fact) !== "" &&
    displayNormalizationKey(fact) === displayNormalizationKey(firstFact),
  );
  if (!sameExactValue && !sameDisplayNormalization) {
    return {
      status: "fact-conflicting",
      facts: orderedCandidates,
      reasonCode: "conflicting-values",
    };
  }

  const ordered = [...orderedCandidates].sort((left, right) =>
    compareRanks(rank(left, constraints, registration), rank(right, constraints, registration)) ||
    left.factId.localeCompare(right.factId),
  );
  const bestRank = rank(ordered[0], constraints, registration);
  const bestCandidates = ordered.filter((fact) =>
    compareRanks(rank(fact, constraints, registration), bestRank) === 0,
  );

  if (ordered[0].freshness === "stale") {
    return { status: "fact-stale", facts: ordered, reasonCode: "only-stale-facts" };
  }

  if ((registration?.citationRequired ?? true) &&
      bestCandidates.every((fact) => !fact.citationEligible || !fact.citationIds.length)) {
    return {
      status: "unsupported-fact-representation",
      scope,
      facts: bestCandidates,
      diagnostics: bestCandidates.map((fact) => ({
        code: "missing-citation",
        message: "A positive result requires an eligible citation.",
        factId: fact.factId,
        sourceApplication: fact.sourceApplication,
        sourceEntityId: fact.sourceEntityId,
        sourceNativeId: fact.sourceNativeId,
        fieldId: fact.fieldId,
        sourceFieldName: fact.sourceFieldName,
        provenance: fact.provenance,
      })),
    };
  }

  return bestCandidates.length === 1
    ? { status: "fact-found", fact: bestCandidates[0] }
    : {
        status: "multiple-compatible-facts",
        facts: bestCandidates,
        scope,
        reasonCode: "equally-ranked-compatible-facts",
      };
}
