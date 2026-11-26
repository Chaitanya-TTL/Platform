export const ENTITY_KIND_COMPATIBILITY_VERSION = "1.0" as const;

export type EntityKindCompatibilityEntryV1 = {
  sourceApplication: "configit" | "codebeamer" | "windchill";
  nativeRecordKind: string;
  canonicalEntityKinds: readonly string[];
};

export const ENTITY_KIND_COMPATIBILITY_V1: readonly EntityKindCompatibilityEntryV1[] = [
  { sourceApplication: "configit", nativeRecordKind: "work-item", canonicalEntityKinds: ["configuration-work-item"] },
  { sourceApplication: "configit", nativeRecordKind: "product-model", canonicalEntityKinds: ["configuration-product-model"] },
  { sourceApplication: "configit", nativeRecordKind: "family", canonicalEntityKinds: ["configuration-family"] },
  { sourceApplication: "configit", nativeRecordKind: "feature", canonicalEntityKinds: ["configuration-feature"] },
  { sourceApplication: "configit", nativeRecordKind: "rule", canonicalEntityKinds: ["configuration-rule"] },
  { sourceApplication: "configit", nativeRecordKind: "language", canonicalEntityKinds: ["localization-language"] },
  { sourceApplication: "configit", nativeRecordKind: "localization", canonicalEntityKinds: ["localization-translation"] },
  { sourceApplication: "codebeamer", nativeRecordKind: "requirement", canonicalEntityKinds: ["requirement"] },
  { sourceApplication: "windchill", nativeRecordKind: "part", canonicalEntityKinds: ["part"] },
  { sourceApplication: "windchill", nativeRecordKind: "part-revision", canonicalEntityKinds: ["part-revision"] },
  { sourceApplication: "windchill", nativeRecordKind: "part-occurrence", canonicalEntityKinds: ["part-occurrence"] },
] as const;

const explicitlyRejectedCanonicalKinds = new Set([
  "source-representation",
  "source-evidence-group",
  "product-detail",
  "relationship",
  "document",
  "investigation-subject",
]);

export type EntityKindCompatibilityResultV1 =
  | { compatible: true; allowedCanonicalKinds: readonly string[] }
  | { compatible: false; allowedCanonicalKinds: readonly string[]; reason: "canonical-kind-explicitly-rejected" | "application-not-registered" | "native-record-kind-not-registered" | "canonical-kind-not-approved" };

export function allowedCanonicalEntityKindsV1(
  sourceApplication: string,
  nativeRecordKinds: readonly string[],
): readonly string[] {
  return [...new Set(
    ENTITY_KIND_COMPATIBILITY_V1
      .filter((entry) => entry.sourceApplication === sourceApplication && nativeRecordKinds.includes(entry.nativeRecordKind))
      .flatMap((entry) => entry.canonicalEntityKinds),
  )].sort();
}

export function evaluateEntityKindCompatibilityV1(input: {
  sourceApplication: string;
  nativeRecordKinds: readonly string[];
  canonicalEntityKind: string;
}): EntityKindCompatibilityResultV1 {
  const allowedCanonicalKinds = allowedCanonicalEntityKindsV1(input.sourceApplication, input.nativeRecordKinds);
  if (explicitlyRejectedCanonicalKinds.has(input.canonicalEntityKind)) {
    return { compatible: false, allowedCanonicalKinds, reason: "canonical-kind-explicitly-rejected" };
  }
  const applicationRegistered = ENTITY_KIND_COMPATIBILITY_V1.some((entry) => entry.sourceApplication === input.sourceApplication);
  if (!applicationRegistered) return { compatible: false, allowedCanonicalKinds, reason: "application-not-registered" };
  if (!allowedCanonicalKinds.length) return { compatible: false, allowedCanonicalKinds, reason: "native-record-kind-not-registered" };
  return allowedCanonicalKinds.includes(input.canonicalEntityKind)
    ? { compatible: true, allowedCanonicalKinds }
    : { compatible: false, allowedCanonicalKinds, reason: "canonical-kind-not-approved" };
}
