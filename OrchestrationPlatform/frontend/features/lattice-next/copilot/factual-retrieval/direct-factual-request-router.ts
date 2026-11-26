import type { FactDiscoveryConstraintsV1, FactFieldRegistrationV1 } from "./structured-fact-discovery";
import { CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1 } from "./codebeamer-requirement-field-registry.v1";
import { CONFIGIT_FIELD_REGISTRY_V1 } from "./configit-field-registry.v1";
import { WINDCHILL_PART_FIELD_REGISTRY_V1 } from "./windchill-part-field-registry.v1";

export type DirectFactDimensionV1 = { dimensionId: string; exactValue: unknown };
export type DirectFactualRequestInputV1 = {
  message: string;
  investigationId: string;
  entityId?: string;
  subjectId?: string;
  revision?: string;
  version?: string;
  asOf?: string;
  dimensions?: readonly DirectFactDimensionV1[];
};

export type DirectFactualRequestRoutingV1 =
  | { status: "not-direct-fact-request"; reasonCode: "non-factual-intent" | "application-not-explicit" | "field-not-resolved" }
  | { status: "ambiguous-direct-fact-request"; reasonCode: "multiple-applications" | "multiple-fields" | "entity-not-resolved"; candidates?: readonly string[] }
  | { status: "unsupported-direct-fact-request"; reasonCode: "unsupported-application" }
  | {
      status: "direct-fact-request";
      constraints: FactDiscoveryConstraintsV1;
      registration: FactFieldRegistrationV1;
    };

type RoutableField = FactFieldRegistrationV1 & { displayLabel: string; sourceApplication: string };

const registryFields: readonly RoutableField[] = [
  ...CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1.fields.map((field) => ({ ...field, aliases: field.sourceFieldNames, expectedValueType: field.valueType, sourceApplication: "codebeamer" })),
  ...WINDCHILL_PART_FIELD_REGISTRY_V1.fields.map((field) => ({ ...field, aliases: field.sourceFieldNames, expectedValueType: field.valueType, sourceApplication: "windchill" })),
  ...CONFIGIT_FIELD_REGISTRY_V1.fields.map((field) => ({ ...field, aliases: field.sourceFieldNames, expectedValueType: field.valueType, sourceApplication: "configit" })),
];

const allApplications = ["codebeamer", "windchill", "configit", "sap", "teamcenter"] as const;
const supportedApplications = new Set(["codebeamer", "windchill", "configit"]);
const nonFactIntent = /\b(inventory|product\s*360|overview|impact|dependency|root[ -]?cause|relationships?|summari[sz]e|summary)\b/i;
const factualCue = /\b(what|which|show|give|tell|is|are|does|do|status|code|name|description|title|value|weight|mass|dimension|expression|enabled|locked|effectivity|revision|version|language)\b/i;

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const phrasePresent = (message: string, phrase: string): boolean => {
  const normalized = normalize(phrase);
  return normalized.length >= 3 && (` ${message} `).includes(` ${normalized} `);
};

const fieldSearchPhrases = (field: RoutableField): readonly string[] => {
  const idParts = field.fieldId.split(".");
  return [...new Set([
    field.displayLabel,
    ...field.aliases,
    idParts[idParts.length - 1] ?? "",
    idParts.slice(-2).join(" "),
  ].map(normalize).filter((value) => value.length >= 3))];
};

export function routeDirectFactualRequest(input: DirectFactualRequestInputV1): DirectFactualRequestRoutingV1 {
  const message = normalize(input.message);
  if (!message || nonFactIntent.test(input.message) || !factualCue.test(input.message)) {
    return { status: "not-direct-fact-request", reasonCode: "non-factual-intent" };
  }

  const mentioned = allApplications.filter((application) => phrasePresent(message, application));
  if (mentioned.length > 1) return { status: "ambiguous-direct-fact-request", reasonCode: "multiple-applications", candidates: mentioned };
  if (!mentioned.length) return { status: "not-direct-fact-request", reasonCode: "application-not-explicit" };

  const sourceApplication = mentioned[0];
  if (!supportedApplications.has(sourceApplication)) return { status: "unsupported-direct-fact-request", reasonCode: "unsupported-application" };

  const matches = registryFields.filter((field) =>
    field.sourceApplication === sourceApplication && fieldSearchPhrases(field).some((phrase) => phrasePresent(message, phrase)),
  );
  const distinctFieldIds = [...new Set(matches.map((field) => field.fieldId))];
  if (!distinctFieldIds.length) return { status: "not-direct-fact-request", reasonCode: "field-not-resolved" };
  if (distinctFieldIds.length > 1) return { status: "ambiguous-direct-fact-request", reasonCode: "multiple-fields", candidates: distinctFieldIds };
  if (!input.entityId) return { status: "ambiguous-direct-fact-request", reasonCode: "entity-not-resolved", candidates: distinctFieldIds };

  const field = matches.find((candidate) => candidate.fieldId === distinctFieldIds[0])!;
  return {
    status: "direct-fact-request",
    registration: {
      fieldId: field.fieldId,
      aliases: field.aliases,
      expectedValueType: field.expectedValueType,
      citationRequired: field.citationRequired,
    },
    constraints: {
      investigationId: input.investigationId,
      subjectId: input.subjectId,
      sourceApplication,
      entityId: input.entityId,
      fieldId: field.fieldId,
      revision: input.revision,
      version: input.version,
      asOf: input.asOf,
      dimensions: input.dimensions,
    },
  };
}
