import {
  FACTUAL_EVIDENCE_CONTRACT_VERSION,
  type FactValueTypeV1,
  type GenericFactRoleV1,
} from "../../contracts/factual-evidence-v1";

export type WindchillPartFieldDefinitionV1 = {
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

export const WINDCHILL_PART_FIELD_REGISTRY_V1 = {
  contractVersion: FACTUAL_EVIDENCE_CONTRACT_VERSION,
  registryId: "windchill-part-core",
  registryVersion: "1.0",
  sourceApplication: "windchill",
  adapterId: "windchill-part-facts",
  adapterVersion: "1.0",
  fields: [
    {
      fieldId: "windchill.part.identity",
      displayLabel: "Part identity",
      sourceFieldNames: ["requirements.part.id"],
      valueType: "identifier",
      factRole: "entity-identity",
      repeatable: false,
      normalizationAllowed: false,
      citationRequired: true,
      freshnessRequirement: "preserve",
    },
    {
      fieldId: "windchill.part.native-id",
      displayLabel: "Source-native identifier",
      sourceFieldNames: ["requirements.part.id", "versions.partId"],
      valueType: "identifier",
      factRole: "entity-identity",
      repeatable: false,
      normalizationAllowed: false,
      citationRequired: true,
      freshnessRequirement: "preserve",
    },
    {
      fieldId: "windchill.part.number",
      displayLabel: "Part number",
      sourceFieldNames: [
        "requirements.part.number",
        "versions.number",
        "windchill.sourceMetadata.partNumber",
      ],
      valueType: "identifier",
      factRole: "entity-attribute",
      repeatable: false,
      normalizationAllowed: false,
      citationRequired: true,
      freshnessRequirement: "preserve",
    },
    {
      fieldId: "windchill.part.revision",
      displayLabel: "Revision",
      sourceFieldNames: ["requirements.part.revision", "versions.revision"],
      valueType: "identifier",
      factRole: "entity-attribute",
      repeatable: false,
      normalizationAllowed: false,
      citationRequired: true,
      freshnessRequirement: "preserve",
    },
    {
      fieldId: "windchill.part.version",
      displayLabel: "Version",
      sourceFieldNames: ["requirements.part.version", "versions.version"],
      valueType: "identifier",
      factRole: "entity-attribute",
      repeatable: false,
      normalizationAllowed: false,
      citationRequired: true,
      freshnessRequirement: "preserve",
    },
    {
      fieldId: "windchill.part.latest",
      displayLabel: "Latest flag",
      sourceFieldNames: ["requirements.part.latest", "versions.latest"],
      valueType: "boolean",
      factRole: "entity-attribute",
      repeatable: false,
      normalizationAllowed: false,
      citationRequired: true,
      freshnessRequirement: "preserve",
    },
    {
      fieldId: "windchill.part.lifecycle-state",
      displayLabel: "Lifecycle state",
      sourceFieldNames: ["requirements.part.state", "versions.state"],
      valueType: "status",
      factRole: "entity-attribute",
      repeatable: false,
      normalizationAllowed: false,
      citationRequired: true,
      freshnessRequirement: "preserve",
    },
    {
      fieldId: "windchill.part.product-view",
      displayLabel: "Product view",
      sourceFieldNames: ["requirements.part.view", "versions.view"],
      valueType: "text",
      factRole: "entity-attribute",
      repeatable: false,
      normalizationAllowed: false,
      citationRequired: true,
      freshnessRequirement: "preserve",
    },
    {
      fieldId: "windchill.part.dimension",
      displayLabel: "Dimension",
      sourceFieldNames: ["requirements.part.customAttributes.dimension"],
      valueType: "quantity",
      factRole: "entity-attribute",
      repeatable: true,
      normalizationAllowed: false,
      citationRequired: true,
      freshnessRequirement: "preserve",
    },
    {
      fieldId: "windchill.part.weight",
      displayLabel: "Weight",
      sourceFieldNames: ["requirements.part.customAttributes.weight"],
      valueType: "quantity",
      factRole: "entity-attribute",
      repeatable: true,
      normalizationAllowed: false,
      citationRequired: true,
      freshnessRequirement: "preserve",
    },
    {
      fieldId: "windchill.part.chemical-composition",
      displayLabel: "Chemical composition",
      sourceFieldNames: ["requirements.part.customAttributes.chemical"],
      valueType: "structured",
      factRole: "entity-attribute",
      repeatable: true,
      normalizationAllowed: false,
      citationRequired: true,
      freshnessRequirement: "preserve",
    },
    {
      fieldId: "windchill.part.material-composition",
      displayLabel: "Material composition",
      sourceFieldNames: ["requirements.part.customAttributes.material"],
      valueType: "structured",
      factRole: "entity-attribute",
      repeatable: true,
      normalizationAllowed: false,
      citationRequired: true,
      freshnessRequirement: "preserve",
    },
  ] as const satisfies readonly WindchillPartFieldDefinitionV1[],
} as const;

export type WindchillPartFieldV1 =
  (typeof WINDCHILL_PART_FIELD_REGISTRY_V1.fields)[number];

export function resolveWindchillPartFields(
  sourceFieldName: string,
): readonly WindchillPartFieldV1[] {
  return WINDCHILL_PART_FIELD_REGISTRY_V1.fields.filter((field) =>
    field.sourceFieldNames.some((name) => name === sourceFieldName),
  );
}
