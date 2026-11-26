import type {
  FactRequestScopeV1,
  FactRetrievalOutcomeV1,
  FactCompletenessV1,
  FactDimensionV1,
  GenericFactV1,
} from "../../contracts/factual-evidence-v1";
import type { IntelligenceAuthority, TemporalContext } from "../../contracts/intelligence-v1";

export type CanonicalFactParityInputV1 = {
  investigationId: string;
  investigationRevision?: number;
  subjectId?: string;
  sourceApplication: string;
  sourceEntityId: string;
  sourceNativeId?: string;
  canonicalEntityKind: string;
  fieldId: string;
  sourceFieldName: string;
  exactSourceValue: unknown;
  unit?: string;
  currency?: string;
  citationIds: readonly string[];
  provenance: unknown;
  sourceAuthority: IntelligenceAuthority;
  observedAt?: string;
  extractedAt?: string;
  capturedAt?: string;
  effectiveAt?: string;
  validFrom?: string;
  validTo?: string;
  dimensions?: readonly FactDimensionV1[];
  freshness: TemporalContext["freshness"];
  completeness: FactCompletenessV1;
};

export type FactParityDiscoveryResultV1 = {
  scope: FactRequestScopeV1;
  outcome: FactRetrievalOutcomeV1;
  investigationRevision?: number;
  dimensions?: readonly FactDimensionV1[];
  observedAt?: string;
  effectiveAt?: string;
  validFrom?: string;
  validTo?: string;
};

export type FactParityObservationV1 = {
  key: string;
  status: "matched" | "missing-fact" | "extra-fact" | "mismatch" | "fact-conflict";
  comparisons: {
    valueEqual: boolean | null;
    identityEqual: boolean | null;
    citationEqual: boolean | null;
    provenanceEqual: boolean | null;
    sourceAuthorityEqual: boolean | null;
    dimensionsEqual: boolean | null;
    timestampsEqual: boolean | null;
    unitCurrencyEqual: boolean | null;
    freshnessEqual: boolean | null;
    completenessEqual: boolean | null;
    discoveryEqual: boolean | null;
  };
  canonical?: CanonicalFactParityInputV1;
  genericFacts: readonly GenericFactV1[];
  discoveryStatus?: FactRetrievalOutcomeV1["status"];
};

export type FactParityReportV1 = {
  observations: readonly FactParityObservationV1[];
  findings: readonly FactParityObservationV1[];
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

const sameStringSet = (left: readonly string[], right: readonly string[]): boolean => {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size &&
    [...leftSet].every((value) => rightSet.has(value));
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
};

const dimensionScope = (
  dimensions?: readonly FactDimensionV1[],
  dimensionIds?: readonly string[],
): readonly unknown[] => dimensions?.length
  ? [...dimensions]
      .sort((left, right) => left.dimensionId.localeCompare(right.dimensionId))
      .map(({ dimensionId, exactValue, valueType, unit }) => ({
        dimensionId,
        exactValue: stableValue(exactValue),
        valueType,
        unit: unit ?? null,
      }))
  : [...(dimensionIds ?? [])].sort();

const scopeKey = (scope: {
  investigationId: string;
  sourceApplication: string;
  sourceEntityId: string;
  fieldId: string;
  investigationRevision?: number;
  dimensions?: readonly FactDimensionV1[];
  dimensionIds?: readonly string[];
  effectiveAt?: string;
  validFrom?: string;
  validTo?: string;
}): string => [
  scope.investigationId,
  scope.sourceApplication,
  scope.sourceEntityId,
  scope.fieldId,
  JSON.stringify(dimensionScope(scope.dimensions, scope.dimensionIds)),
  JSON.stringify([
    scope.investigationRevision ?? null,
    scope.effectiveAt ?? null,
    scope.validFrom ?? null,
    scope.validTo ?? null,
  ]),
].map((value) => encodeURIComponent(value)).join(":");

const candidateIdFor = (provenance: unknown): string | undefined =>
provenance !== null &&
typeof provenance === "object" &&
!Array.isArray(provenance) &&
typeof (provenance as Record<string, unknown>).candidateId === "string"
  ? (provenance as Record<string, string>).candidateId
  : undefined;

const factKey = (fact: Pick<
CanonicalFactParityInputV1,
| "investigationId"
| "sourceApplication"
| "sourceEntityId"
| "fieldId"
| "investigationRevision"
| "dimensions"
| "effectiveAt"
| "validFrom"
| "validTo"
| "provenance"
>): string => [
fact.investigationId,
fact.sourceApplication,
fact.sourceEntityId,
fact.fieldId,
candidateIdFor(fact.provenance) ??
  JSON.stringify([
    dimensionScope(fact.dimensions),
    fact.investigationRevision ?? null,
    fact.effectiveAt ?? null,
    fact.validFrom ?? null,
    fact.validTo ?? null,
  ]),
].map(encodeURIComponent).join(":");

const discoveryKey = (result: FactParityDiscoveryResultV1): string => scopeKey({
  investigationId: result.scope.investigationId ?? "",
  sourceApplication: result.scope.sourceApplication ?? "",
  sourceEntityId: result.scope.entityId ?? "",
  fieldId: result.scope.fieldId ?? "",
  investigationRevision: result.investigationRevision,
  dimensions: result.dimensions,
  dimensionIds: result.scope.dimensionIds,
  effectiveAt: result.effectiveAt,
  validFrom: result.validFrom,
  validTo: result.validTo,
});

const dimensionsEqual = (
  left: readonly FactDimensionV1[] | undefined,
  right: readonly FactDimensionV1[],
): boolean => sameValue(dimensionScope(left), dimensionScope(right));

const surfacedFacts = (outcome: FactRetrievalOutcomeV1): readonly GenericFactV1[] => {
  switch (outcome.status) {
    case "fact-found":
    case "safe-aggregate":
      return [outcome.fact];
    case "multiple-compatible-facts":
    case "incompatible-facts":
    case "fact-stale":
    case "fact-conflicting":
    case "ambiguous-entity":
    case "ambiguous-field":
      return "facts" in outcome ? outcome.facts : outcome.candidates;
    default:
      return [];
  }
};

const discoveryMatches = (
  canonical: CanonicalFactParityInputV1 | undefined,
  genericFacts: readonly GenericFactV1[],
  result: FactParityDiscoveryResultV1 | undefined,
): boolean | null => {
  if (!result) return false;
  const surfaced = surfacedFacts(result.outcome);
  if (!genericFacts.length) return surfaced.length === 0;
  if (!surfaced.length) return false;
  return genericFacts.every((generic) =>
    surfaced.some((fact) =>
      fact.factId === generic.factId &&
      sameValue(fact.exactSourceValue, generic.exactSourceValue),
    ),
  ) && (!canonical || genericFacts.some((fact) =>
    sameValue(fact.exactSourceValue, canonical.exactSourceValue),
  ));
};

export function compareFactParity(
  canonicalFacts: readonly CanonicalFactParityInputV1[],
  genericFacts: readonly GenericFactV1[],
  discoveryResults: readonly FactParityDiscoveryResultV1[],
): FactParityReportV1 {
  const canonicalByKey = new Map(canonicalFacts.map((fact) => [factKey(fact), fact]));
  const genericByKey = new Map<string, GenericFactV1[]>();
  const discoveryByKey = new Map(
    discoveryResults.map((result) => [discoveryKey(result), result]),
  );
  for (const fact of genericFacts) {
    const key = factKey(fact);
    const matches = genericByKey.get(key) ?? [];
    matches.push(fact);
    genericByKey.set(key, matches);
  }

  const keys = new Set([...canonicalByKey.keys(), ...genericByKey.keys()]);
  const observations = [...keys].sort().map((key): FactParityObservationV1 => {
    const canonical = canonicalByKey.get(key);
    const facts = genericByKey.get(key) ?? [];
    const first = facts[0];
    const discovery = canonical
        ? discoveryByKey.get(scopeKey(canonical))
        : first && discoveryByKey.get(scopeKey(first));
    const conflict = facts.some((fact) =>
      !sameValue(fact.exactSourceValue, first?.exactSourceValue),
    ) || discovery?.outcome.status === "fact-conflicting";

    if (!canonical) {
      return {
        key,
        status: conflict ? "fact-conflict" : "extra-fact",
        comparisons: {
          valueEqual: null,
          identityEqual: null,
          citationEqual: null,
          provenanceEqual: null,
          sourceAuthorityEqual: null,
          dimensionsEqual: null,
          timestampsEqual: null,
          unitCurrencyEqual: null,
          freshnessEqual: null,
          completenessEqual: null,
          discoveryEqual: discoveryMatches(undefined, facts, discovery),
        },
        genericFacts: facts,
        discoveryStatus: discovery?.outcome.status,
      };
    }

    const valueEqual = facts.length > 0 && facts.every((fact) =>
      sameValue(canonical.exactSourceValue, fact.exactSourceValue),
    );
    const identityEqual = facts.length > 0 && facts.every((fact) =>
      fact.investigationId === canonical.investigationId &&
      fact.subjectId === canonical.subjectId &&
      fact.sourceApplication === canonical.sourceApplication &&
      fact.sourceEntityId === canonical.sourceEntityId &&
      fact.sourceNativeId === canonical.sourceNativeId &&
      fact.canonicalEntityKind === canonical.canonicalEntityKind &&
      fact.fieldId === canonical.fieldId &&
      fact.sourceFieldName === canonical.sourceFieldName,
    );
    const citationEqual = facts.length > 0 && facts.every((fact) =>
      sameStringSet(canonical.citationIds, fact.citationIds),
    );
    const provenanceEqual = facts.length > 0 && facts.every((fact) =>
      sameValue(canonical.provenance, fact.provenance),
    );
    const sourceAuthorityEqual = facts.length > 0 && facts.every((fact) =>
      canonical.sourceAuthority === fact.sourceAuthority,
    );
    const dimensionsMatch = facts.length > 0 && facts.every((fact) =>
      dimensionsEqual(canonical.dimensions, fact.dimensions),
    );
    const timestampsEqual = facts.length > 0 && facts.every((fact) =>
      fact.observedAt === canonical.observedAt &&
      fact.extractedAt === canonical.extractedAt &&
      fact.capturedAt === canonical.capturedAt &&
      fact.effectiveAt === canonical.effectiveAt &&
      fact.validFrom === canonical.validFrom &&
      fact.validTo === canonical.validTo,
    );
    const unitCurrencyEqual = facts.length > 0 && facts.every((fact) =>
      fact.unit === canonical.unit && fact.currency === canonical.currency,
    );
    const freshnessEqual = facts.length > 0 && facts.every((fact) =>
      fact.freshness === canonical.freshness,
    );
    const completenessEqual = facts.length > 0 && facts.every((fact) =>
      fact.completeness === canonical.completeness,
    );
    const discoveryEqual = discoveryMatches(canonical, facts, discovery);
    const comparisons = {
      valueEqual,
      identityEqual,
      citationEqual,
      provenanceEqual,
      sourceAuthorityEqual,
      dimensionsEqual: dimensionsMatch,
      timestampsEqual,
      unitCurrencyEqual,
      freshnessEqual,
      completenessEqual,
      discoveryEqual,
    };
    const hasMismatch = Object.values(comparisons).some((value) => value === false);

    return {
      key,
      status: conflict
        ? "fact-conflict"
        : facts.length === 0
          ? "missing-fact"
          : hasMismatch
            ? "mismatch"
            : "matched",
      comparisons,
      canonical,
      genericFacts: facts,
      discoveryStatus: discovery?.outcome.status,
    };
  });

  return {
    observations,
    findings: observations.filter((observation) => observation.status !== "matched"),
  };
}
