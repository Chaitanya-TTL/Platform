import {
  FACTUAL_EVIDENCE_CONTRACT_VERSION,
  type FactValueTypeV1,
  type GenericFactRoleV1,
} from "../../contracts/factual-evidence-v1";

export type ConfigitFieldDefinitionV1 = {
  fieldId: string;
  displayLabel: string;
  sourceFieldNames: readonly string[];
  nativeRecordKinds: readonly string[];
  valueType: FactValueTypeV1;
  factRole: GenericFactRoleV1;
  repeatable: boolean;
  normalizationAllowed: boolean;
  requiredContextDimensions: readonly string[];
  citationRequired: boolean;
  freshnessRequirement: "preserve" | "require-known" | "not-applicable";
  conflictScope: readonly string[];
};

const conflictScope = [
  "subject",
  "application",
  "source-entity",
  "field",
  "dimensions",
  "temporal",
] as const;

const field = (
  fieldId: string,
  displayLabel: string,
  sourceFieldNames: readonly string[],
  nativeRecordKinds: readonly string[],
  valueType: FactValueTypeV1,
  factRole: GenericFactRoleV1,
  requiredContextDimensions: readonly string[] = [],
  repeatable = false,
): ConfigitFieldDefinitionV1 => ({
  fieldId,
  displayLabel,
  sourceFieldNames,
  nativeRecordKinds,
  valueType,
  factRole,
  repeatable,
  normalizationAllowed: false,
  requiredContextDimensions,
  citationRequired: true,
  freshnessRequirement: "preserve",
  conflictScope,
});

export const CONFIGIT_FIELD_REGISTRY_V1 = {
  contractVersion: FACTUAL_EVIDENCE_CONTRACT_VERSION,
  registryId: "configit-authoring-facts",
  registryVersion: "1.0",
  sourceApplication: "configit",
  adapterId: "configit-facts",
  adapterVersion: "1.0",
  fields: [
    field("configit.work-item.identity", "Work-item identity", ["workItem.id"], ["work-item"], "identifier", "entity-identity"),
    field("configit.work-item.native-id", "Source-native work-item ID", ["workItem.id"], ["work-item"], "identifier", "entity-identity"),
    field("configit.work-item.name", "Work-item name", ["workItem.name"], ["work-item"], "text", "entity-attribute"),
    field("configit.work-item.status", "Work-item status", ["workItem.status"], ["work-item"], "status", "entity-attribute"),
    field("configit.product-model.identity", "Product-model identity", ["productModel.id"], ["product-model"], "identifier", "entity-identity"),
    field("configit.product-model.code", "Product-model code", ["productModel.code"], ["product-model"], "identifier", "entity-attribute"),
    field("configit.product-model.description", "Product-model description", ["productModel.description", "productModel.name"], ["product-model"], "text", "entity-attribute"),
    field("configit.product-context.identity", "Product-context identity", ["productModel.code"], ["product-model"], "identifier", "entity-identity"),
    field("configit.product-context.code", "Product-context code", ["productModel.code"], ["product-model"], "identifier", "entity-attribute"),
    field("configit.family.identity", "Family identity", ["family.id"], ["family"], "identifier", "entity-identity", ["product-model-code"]),
    field("configit.family.code", "Family code", ["family.code"], ["family"], "identifier", "entity-attribute", ["product-model-code"]),
    field("configit.family.description", "Family description", ["family.description", "family.name"], ["family"], "text", "entity-attribute", ["product-model-code"]),
    field("configit.family.type", "Family type", ["family.familyType", "family.type"], ["family"], "status", "entity-attribute", ["product-model-code"]),
    field("configit.family.parent-id", "Parent family identifier", [], ["family"], "identifier", "entity-attribute", ["product-model-code"]),
    field("configit.feature.identity", "Feature identity", ["feature.id"], ["feature"], "identifier", "entity-identity", ["product-model-code", "family-code"]),
    field("configit.feature.code", "Feature code", ["feature.code"], ["feature"], "identifier", "entity-attribute", ["product-model-code", "family-code"]),
    field("configit.feature.description", "Feature description", ["feature.description", "feature.name"], ["feature"], "text", "entity-attribute", ["product-model-code", "family-code"]),
    field("configit.feature.owner-family-id", "Owning family identifier", [], ["feature"], "identifier", "entity-attribute", ["product-model-code", "family-code"]),
    field("configit.rule.identity", "Rule identity", ["rule.code"], ["rule"], "identifier", "entity-identity", ["work-item-id", "product-model-code"]),
    field("configit.rule.code", "Rule code", ["rule.code"], ["rule"], "identifier", "entity-attribute", ["work-item-id", "product-model-code"]),
    field("configit.rule.description", "Rule description", ["rule.description"], ["rule"], "text", "entity-attribute", ["work-item-id", "product-model-code"]),
    field("configit.rule.expression", "Rule expression", ["rule.text", "rule.expression"], ["rule"], "text", "entity-attribute", ["work-item-id", "product-model-code"]),
    field("configit.rule.enabled", "Rule enabled", ["rule.isEnabled", "rule.enabled"], ["rule"], "boolean", "entity-attribute", ["work-item-id", "product-model-code"]),
    field("configit.rule.locked", "Rule locked", ["rule.isLocked", "rule.locked"], ["rule"], "boolean", "entity-attribute", ["work-item-id", "product-model-code"]),
    field("configit.rule.effectivity.start-event-code", "Rule effectivity start event code", ["rule.effectivity.startEventCode"], ["rule"], "identifier", "entity-attribute", ["work-item-id", "product-model-code"]),
    field("configit.rule.effectivity.end-event-code", "Rule effectivity end event code", ["rule.effectivity.endEventCode"], ["rule"], "identifier", "entity-attribute", ["work-item-id", "product-model-code"]),
    field("configit.localization.language.identity", "Language identity", ["language.id"], ["language"], "identifier", "entity-identity"),
    field("configit.localization.language.code", "Language code", ["language.code", "language.languageCode"], ["language"], "identifier", "entity-attribute"),
    field("configit.localization.language.name", "Language name", ["language.name"], ["language"], "text", "entity-attribute"),
    field("configit.localization.language.description", "Language description", ["language.description"], ["language"], "text", "entity-attribute"),
    field("configit.localization.translation.identity", "Translation identity", ["translation.id"], ["localization"], "identifier", "entity-identity", ["work-item-id", "localization-kind", "language"]),
    field("configit.localization.declaration-code", "Localization declaration code", ["translation.translationDeclaration.code", "translation.translationDeclarationCode"], ["localization"], "identifier", "entity-attribute", ["work-item-id", "localization-kind", "language"]),
    field("configit.localization.translation.language-code", "Translation language code", ["translation.languageCode", "translation.language"], ["localization"], "identifier", "entity-attribute", ["work-item-id", "localization-kind", "language"]),
    field("configit.localization.text", "Localized text", ["translation.translation", "translation.translatedText", "translation.text"], ["localization"], "text", "entity-attribute", ["work-item-id", "localization-kind", "language"], true),
  ] as const satisfies readonly ConfigitFieldDefinitionV1[],
} as const;

export type ConfigitFieldV1 = (typeof CONFIGIT_FIELD_REGISTRY_V1.fields)[number];

export function resolveConfigitFields(sourceFieldName: string): readonly ConfigitFieldV1[] {
  return CONFIGIT_FIELD_REGISTRY_V1.fields.filter((registration) =>
    registration.sourceFieldNames.includes(sourceFieldName),
  );
}
