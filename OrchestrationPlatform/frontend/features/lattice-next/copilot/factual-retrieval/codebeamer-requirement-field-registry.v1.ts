import {
  FACTUAL_EVIDENCE_CONTRACT_VERSION,
  type FactValueTypeV1,
  type GenericFactRoleV1,
} from "../../contracts/factual-evidence-v1";

export type CodebeamerRequirementFieldDefinitionV1 = {
  fieldId: string;
  displayLabel: string;
  sourceFieldNames: readonly string[];
  valueType: FactValueTypeV1;
  factRole: GenericFactRoleV1;
  repeatable: boolean;
  normalizationAllowed: boolean;
  citationRequired: boolean;
  freshnessRequirement: "preserve" | "require-known" | "not-applicable";
};

export const CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1 = {
  contractVersion: FACTUAL_EVIDENCE_CONTRACT_VERSION,
  registryId: "codebeamer-requirement-core",
  registryVersion: "1.0",
  sourceApplication: "codebeamer",
  adapterId: "codebeamer-requirement-facts",
  adapterVersion: "1.0",
  fields: [
    {
      fieldId: "requirement.native-id",
      displayLabel: "Source-native identifier",
      sourceFieldNames: ["liveEnrichment.item.data.id", "requirement.itemId"],
      valueType: "identifier",
      factRole: "entity-identity",
      repeatable: false,
      normalizationAllowed: false,
      citationRequired: true,
      freshnessRequirement: "preserve",
    },
    {
      fieldId: "requirement.title",
      displayLabel: "Title",
      sourceFieldNames: ["requirement.name", "liveEnrichment.item.data.name"],
      valueType: "text",
      factRole: "entity-attribute",
      repeatable: false,
      normalizationAllowed: false,
      citationRequired: true,
      freshnessRequirement: "preserve",
    },
    {
      fieldId: "requirement.status",
      displayLabel: "Status",
      sourceFieldNames: ["liveEnrichment.item.data.status", "requirement.status"],
      valueType: "status",
      factRole: "entity-attribute",
      repeatable: false,
      normalizationAllowed: false,
      citationRequired: true,
      freshnessRequirement: "preserve",
    },
    {
      fieldId: "requirement.description",
      displayLabel: "Description",
      sourceFieldNames: [
        "liveEnrichment.item.data.description",
        "requirement.description",
      ],
      valueType: "text",
      factRole: "entity-attribute",
      repeatable: false,
      normalizationAllowed: false,
      citationRequired: true,
      freshnessRequirement: "preserve",
    },
  ] as const satisfies readonly CodebeamerRequirementFieldDefinitionV1[],
} as const;

export type CodebeamerRequirementFieldV1 =
  (typeof CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1.fields)[number];

export function resolveCodebeamerRequirementField(
  sourceFieldName: string,
): CodebeamerRequirementFieldV1 | undefined {
  return CODEBEAMER_REQUIREMENT_FIELD_REGISTRY_V1.fields.find((field) =>
    field.sourceFieldNames.some((registeredName) => registeredName === sourceFieldName),
  );
}
