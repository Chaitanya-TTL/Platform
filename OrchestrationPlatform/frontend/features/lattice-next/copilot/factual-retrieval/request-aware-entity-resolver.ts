import type { EngineeringIntelligenceInvestigationV1, IntelligenceEntity } from "../../contracts/intelligence-v1";
import { CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1 } from "./codebeamer-requirement-field-registry.v1";
import { CONFIGIT_FIELD_REGISTRY_V1 } from "./configit-field-registry.v1";
import { routeDirectFactualRequest } from "./direct-factual-request-router";
import { WINDCHILL_PART_FIELD_REGISTRY_V1 } from "./windchill-part-field-registry.v1";
import { allowedCanonicalEntityKindsV1, evaluateEntityKindCompatibilityV1 } from "./entity-kind-compatibility.v1";

export type RequestAwareSelectionV1 = { source: string; nativeId: string };
export type RequestAwareEntityShapeDiagnosticV1 = {
  entityId: string;
  entityKind?: string;
  nativeRecordKinds: readonly string[];
  metadataFields: readonly string[];
  compatible: boolean;
  rejectionReason?: string;
};

export type RequestAwareEntityResolutionV1 =
  | { status: "route-not-resolved"; routeStatus: string; reasonCode?: string }
  | { status: "resolved"; entityId: string; sourceApplication: string; fieldId: string; nativeRecordKinds: readonly string[]; allowedCanonicalKinds: readonly string[]; matchingEntityIds: readonly string[]; candidateEntityShapes: readonly RequestAwareEntityShapeDiagnosticV1[] }
  | { status: "no-match" | "ambiguous"; sourceApplication: string; fieldId: string; nativeRecordKinds: readonly string[]; allowedCanonicalKinds: readonly string[]; matchingEntityIds: readonly string[]; candidateEntityShapes: readonly RequestAwareEntityShapeDiagnosticV1[] };

const definitions = [
  ...CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1.fields.map((field) => ({ ...field, sourceApplication: "codebeamer" })),
  ...WINDCHILL_PART_FIELD_REGISTRY_V1.fields.map((field) => ({ ...field, sourceApplication: "windchill" })),
  ...CONFIGIT_FIELD_REGISTRY_V1.fields.map((field) => ({ ...field, sourceApplication: "configit" })),
] as const;

const applicationNativeRecordKinds: Readonly<Record<string, readonly string[]>> = {
  codebeamer: ["requirement"],
  windchill: ["part", "part-revision", "part-occurrence"],
};

const nativeRecordKindsFor = (sourceApplication: string, fieldId: string): readonly string[] => {
  const definition = definitions.find((candidate) => candidate.sourceApplication === sourceApplication && candidate.fieldId === fieldId);
  return definition && "nativeRecordKinds" in definition
    ? definition.nativeRecordKinds
    : applicationNativeRecordKinds[sourceApplication] ?? [];
};

const entityNativeRecordKinds = (entity: IntelligenceEntity): ReadonlySet<string> => {
  const kinds = new Set<string>();
  for (const candidates of Object.values(entity.sourceFieldMetadata ?? {})) {
    for (const candidate of candidates) if (candidate.nativeRecordKind) kinds.add(candidate.nativeRecordKind);
  }
  return kinds;
};

export function resolveRequestAwareEntity(input: {
  message: string;
  investigationId: string;
  investigation: EngineeringIntelligenceInvestigationV1;
  selections: readonly RequestAwareSelectionV1[];
  revision?: string;
  version?: string;
  dimensions?: readonly { dimensionId: string; exactValue: unknown }[];
}): RequestAwareEntityResolutionV1 {
  const route = routeDirectFactualRequest({ message: input.message, investigationId: input.investigationId, entityId: "__request-aware-probe__", revision: input.revision, version: input.version, dimensions: input.dimensions });
  if (route.status !== "direct-fact-request") {
    return { status: "route-not-resolved", routeStatus: route.status, ...( "reasonCode" in route ? { reasonCode: route.reasonCode } : {}) };
  }
  const sourceApplication = route.constraints.sourceApplication!;
  const fieldId = route.constraints.fieldId!;
  const nativeRecordKinds = nativeRecordKindsFor(sourceApplication, fieldId);
  const selectedNativeIds = new Set(input.selections.filter((selection) => selection.source === sourceApplication).map((selection) => selection.nativeId));
  const allowedCanonicalKinds = allowedCanonicalEntityKindsV1(sourceApplication, nativeRecordKinds);
  const sourceNativeMatches = input.investigation.entities
    .filter((entity) => entity.provenance.source === sourceApplication && entity.provenance.nativeId && selectedNativeIds.has(entity.provenance.nativeId));
  const hasExactProperty = (entity: IntelligenceEntity, key: string, expected: unknown): boolean =>
    expected === undefined || Object.is(entity.properties?.[key], expected);
  const hasDimensions = (entity: IntelligenceEntity): boolean => (input.dimensions ?? []).every((required) =>
    Object.values(entity.sourceFieldMetadata ?? {}).flat().some((candidate) =>
      candidate.sourceScope?.dimensions?.some((dimension) => dimension.dimensionId === required.dimensionId && Object.is(dimension.exactValue, required.exactValue)),
    ),
  );
  const candidateEntityShapes = sourceNativeMatches.map((entity) => {
    const compatibility = evaluateEntityKindCompatibilityV1({ sourceApplication, nativeRecordKinds, canonicalEntityKind: entity.kind });
    const contextualMatch = hasExactProperty(entity, "revision", input.revision) && hasExactProperty(entity, "version", input.version) && hasDimensions(entity);
    return {
      entityId: entity.id,
      entityKind: entity.kind,
      nativeRecordKinds: [...entityNativeRecordKinds(entity)].sort(),
      metadataFields: Object.keys(entity.sourceFieldMetadata ?? {}).sort(),
      compatible: compatibility.compatible && contextualMatch,
      ...(!compatibility.compatible ? { rejectionReason: compatibility.reason } : !contextualMatch ? { rejectionReason: "explicit-scope-mismatch" } : {}),
    };
  });
  const matchingEntityIds = candidateEntityShapes.filter((candidate) => candidate.compatible).map((candidate) => candidate.entityId).sort();
  const unique = [...new Set(matchingEntityIds)];
  if (unique.length === 1) return { status: "resolved", entityId: unique[0], sourceApplication, fieldId, nativeRecordKinds, allowedCanonicalKinds, matchingEntityIds: unique, candidateEntityShapes };
  return { status: unique.length ? "ambiguous" : "no-match", sourceApplication, fieldId, nativeRecordKinds, allowedCanonicalKinds, matchingEntityIds: unique, candidateEntityShapes };
}
