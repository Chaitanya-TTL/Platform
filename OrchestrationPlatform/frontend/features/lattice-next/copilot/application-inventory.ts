import type {
  ApplicationInventoryProjection,
  CopilotEntityContext,
  CopilotRelationshipContext,
  StructuredEvidenceGap,
} from "./contracts";
 
export interface ApplicationRecordTypeDefinition {
  key: string;
  label: string;
  aliases: readonly string[];
  canonicalKinds: readonly string[];
  sourceRecordKinds?: readonly string[];
  relationshipKinds?: readonly string[];
  endpointRole?: "source" | "target";
}
 
const EMPTY_GROUP_TEXT = "No supported record of this type was found in the selected evidence.";
 
const APPLICATION_RECORD_TYPES: Readonly<Record<string, readonly ApplicationRecordTypeDefinition[]>> = {
  windchill: [
    {
      key: "parts",
      label: "Parts",
      aliases: ["parts?", "engineering parts?"],
      canonicalKinds: ["part", "source-representation"],
    },
    {
      key: "part-occurrences",
      label: "Part occurrences and structures",
      aliases: ["part[ -]occurrences?", "structures?", "occurrences?"],
      canonicalKinds: ["part-occurrence"],
      relationshipKinds: ["contains", "has-occurrence"],
    },
    {
      key: "part-revisions",
      label: "Part revisions",
      aliases: ["part[ -]revisions?"],
      canonicalKinds: ["part-revision"],
      sourceRecordKinds: ["part-revision"],
    },
    {
      key: "documents",
      label: "Documents",
      aliases: ["documents?", "specifications?"],
      canonicalKinds: ["document"],
      sourceRecordKinds: ["document", "specification"],
    },
    {
      key: "change-notices",
      label: "Change Notices",
      aliases: ["change[ -]notices?"],
      canonicalKinds: ["change-notice"],
      sourceRecordKinds: ["change-notice"],
    },
    {
      key: "change-tasks",
      label: "Change Tasks",
      aliases: ["change[ -]tasks?"],
      canonicalKinds: ["change-task"],
      sourceRecordKinds: ["change-task"],
    },
    {
      key: "other-change-records",
      label: "Other change records",
      aliases: ["other change records?"],
      canonicalKinds: ["change-record", "change-request", "change-order", "engineering-change"],
      sourceRecordKinds: ["change-record", "change-request", "change-order", "engineering-change"],
    },
    {
      key: "all-change-records",
      label: "All change records",
      aliases: ["all change records?"],
      canonicalKinds: ["change-notice", "change-task", "change-record", "change-request", "change-order", "engineering-change"],
      sourceRecordKinds: ["change-notice", "change-task", "change-record", "change-request", "change-order", "engineering-change"],
    },
  ],
  sap: [
    {
      key: "materials",
      label: "Materials",
      aliases: ["materials?", "material[ -]masters?"],
      canonicalKinds: ["material", "material-master", "source-representation"],
    },
    {
      key: "boms",
      label: "Bills of material",
      aliases: ["boms?", "bills? of materials?"],
      canonicalKinds: ["material", "material-master", "source-representation"],
      relationshipKinds: ["contains", "has-item", "has-component"],
    },
    {
      key: "movements",
      label: "Material movements",
      aliases: ["movements?", "material movements?"],
      canonicalKinds: ["material-movement"],
    },
    {
      key: "accounting-documents",
      label: "Accounting documents",
      aliases: ["accounting documents?"],
      canonicalKinds: ["accounting-document", "accounting-line"],
    },
    {
      key: "stock-metrics",
      label: "Stock metrics",
      aliases: ["stock metrics?"],
      canonicalKinds: ["stock-metric"],
    },
    {
      key: "transactions",
      label: "Transactions",
      aliases: ["transactions?"],
      canonicalKinds: ["material-movement", "accounting-document", "accounting-line"],
    },
    {
      key: "operational-records",
      label: "Operational records",
      aliases: ["operational records?"],
      canonicalKinds: [
        "material-movement",
        "accounting-document",
        "accounting-line",
        "stock-metric",
        "history-metric",
        "stock-position",
        "valuation-context",
        "plant",
        "storage-location",
      ],
    },
  ],
  configit: [
    {
      key: "products-and-work-items",
      label: "Products and work items",
      aliases: ["products?", "work[ -]items?"],
      canonicalKinds: ["product-detail", "source-representation"],
    },
    {
      key: "models-and-contexts",
      label: "Product models and contexts",
      aliases: ["models?", "product models?", "configuration models?", "contexts?"],
      canonicalKinds: ["product-context"],
    },
    {
      key: "families",
      label: "Families",
      aliases: ["families"],
      canonicalKinds: ["configuration-family"],
    },
    {
      key: "features",
      label: "Features",
      aliases: ["features?"],
      canonicalKinds: ["configuration-feature", "configuration-option"],
    },
    {
      key: "rules-and-expressions",
      label: "Rules and expressions",
      aliases: ["rules?", "expressions?"],
      canonicalKinds: ["configuration-rule", "configuration-rule-field"],
    },
    {
      key: "metadata",
      label: "Metadata",
      aliases: ["metadata"],
      canonicalKinds: [
        "localization-language",
        "localization-translation",
        "source-evidence-group",
        "source-evidence-field",
        "configuration-rule-field",
      ],
    },
  ],
  codebeamer: [
    {
      key: "requirements",
      label: "Requirements",
      aliases: ["requirements?"],
      canonicalKinds: ["requirement", "requirement-revision", "requirement-detail"],
    },
    {
      key: "parent-requirements",
      label: "Parent requirements",
      aliases: ["parent requirements?"],
      canonicalKinds: ["requirement", "requirement-revision"],
      relationshipKinds: ["parent-of"],
      endpointRole: "source",
    },
    {
      key: "child-requirements",
      label: "Child requirements",
      aliases: ["child requirements?"],
      canonicalKinds: ["requirement", "requirement-revision"],
      relationshipKinds: ["parent-of"],
      endpointRole: "target",
    },
    {
      key: "work-items",
      label: "Work items",
      aliases: ["work[ -]items?"],
      canonicalKinds: ["requirement", "requirement-revision"],
    },
    {
      key: "requirement-hierarchy",
      label: "Requirement hierarchy",
      aliases: ["requirement hierarch(?:y|ies)"],
      canonicalKinds: ["requirement", "requirement-revision"],
      relationshipKinds: ["parent-of"],
    },
  ],
};
 
function matchesAlias(message: string, alias: string): boolean {
  return new RegExp(`\\b(?:${alias})\\b`, "i").test(message);
}
 
export function isApplicationInventoryQuestion(message: string): boolean {
  if (/^\s*what\s+is\s+(?:the\s+)?(?:sap|windchill|configit|codebeamer)\s+(?:material|part|document|record|requirement)\b/i.test(message)) {
    return false;
  }
  if (/\b(?:document|manual|specification|requirements?)\b.{0,60}\b(?:describes?|explains?|says?|states?)\b/i.test(message)) {
    return false;
  }
  if (/\b(?:relationship|connected|linked|traceability|impact path|dependency)\b/i.test(message)) return false;
  const asksForInventory = /\b(?:which|what|list|show|inventory)\b/i.test(message);
  const namesRecordType = Object.values(APPLICATION_RECORD_TYPES).some((groups) =>
    groups.some((group) => group.aliases.some((alias) => matchesAlias(message, alias))),
  );
  const asksForRecords = /\b(?:records?|entities|inventory)\b/i.test(message);
  return asksForInventory && (namesRecordType || asksForRecords);
}
 
export function requestedApplicationRecordTypes(
  application: string,
  message: string,
): readonly ApplicationRecordTypeDefinition[] {
  const groups = APPLICATION_RECORD_TYPES[application.toLocaleLowerCase()] ?? [];
  const matched = groups.filter((group) =>
    group.aliases.some((alias) => matchesAlias(message, alias)),
  );
  if (application.toLocaleLowerCase() === "windchill" &&
      /\b(?:change records?|changes?)\b/i.test(message)) {
    const changeGroups = groups.filter((group) =>
      ["change-notices", "change-tasks", "other-change-records"].includes(group.key),
    );
    return [...new Set([...matched, ...changeGroups])].sort((left, right) =>
      groups.indexOf(left) - groups.indexOf(right),
    );
  }
  if (matched.length) return matched;
  return groups;
}
 
function entityMatchesDefinition(
  entity: CopilotEntityContext,
  definition: ApplicationRecordTypeDefinition,
): boolean {
  const sourceRecordKind = entity.properties.recordKind?.toLocaleLowerCase();
  if (sourceRecordKind && definition.sourceRecordKinds) {
    return definition.sourceRecordKinds.includes(sourceRecordKind);
  }
  return definition.canonicalKinds.includes(entity.kind.toLocaleLowerCase());
}
 
function relationshipMatchesKinds(
  relationship: CopilotRelationshipContext,
  kinds: readonly string[],
): boolean {
  return kinds.includes(relationship.kind.toLocaleLowerCase());
}
 
export function applicationInventoryEntityMatches(
  application: string,
  groups: readonly ApplicationRecordTypeDefinition[],
  entity: CopilotEntityContext,
): boolean {
  if (entity.source?.toLocaleLowerCase() !== application.toLocaleLowerCase()) return false;
  if (application.toLocaleLowerCase() === "sap" &&
      groups.some((group) => group.key === "materials") &&
      entity.kind.toLocaleLowerCase() === "product-detail") {
    return true;
  }
  return groups.some((group) => entityMatchesDefinition(entity, group));
}
 
export function projectApplicationInventory(
  application: string,
  definitions: readonly ApplicationRecordTypeDefinition[],
  entityContexts: readonly CopilotEntityContext[],
  relationshipContexts: readonly CopilotRelationshipContext[],
  completeEntityContexts: readonly CopilotEntityContext[] = entityContexts,
  completeRelationshipContexts: readonly CopilotRelationshipContext[] = relationshipContexts,
): ApplicationInventoryProjection {
  const applicationEntities = entityContexts.filter((entity) =>
    entity.source?.toLocaleLowerCase() === application.toLocaleLowerCase(),
  );
  const applicationRelationships = relationshipContexts.filter((relationship) => {
    const source = applicationEntities.find((entity) => entity.entityId === relationship.sourceEntityId);
    const target = applicationEntities.find((entity) => entity.entityId === relationship.targetEntityId);
    return Boolean(source && target);
  });
  const completeApplicationEntities = completeEntityContexts.filter((entity) =>
    entity.source?.toLocaleLowerCase() === application.toLocaleLowerCase(),
  );
  const completeApplicationRelationships = completeRelationshipContexts.filter((relationship) => {
    const source = completeApplicationEntities.find((entity) => entity.entityId === relationship.sourceEntityId);
    const target = completeApplicationEntities.find((entity) => entity.entityId === relationship.targetEntityId);
    return Boolean(source && target);
  });
  const entityIndexById = new Map(applicationEntities.map((entity, index) => [entity.entityId, index]));
  const relationshipIndexById = new Map(applicationRelationships.map((relationship, index) => [
    relationship.relationshipId,
    index,
  ]));
  const groups = definitions.map((definition) => {
    const matchingRelationships = definition.relationshipKinds
      ? applicationRelationships.filter((relationship) =>
          relationshipMatchesKinds(relationship, definition.relationshipKinds!),
        )
      : [];
    const relatedEntityIds = new Set(matchingRelationships.flatMap((relationship) => {
      if (definition.endpointRole === "source") return [relationship.sourceEntityId];
      if (definition.endpointRole === "target") return [relationship.targetEntityId];
      return [relationship.sourceEntityId, relationship.targetEntityId];
    }));
    const matchingEntities = applicationEntities.filter((entity) =>
      entityMatchesDefinition(entity, definition) &&
      (!definition.endpointRole || relatedEntityIds.has(entity.entityId)),
    );
    const completeMatchingRelationships = definition.relationshipKinds
      ? completeApplicationRelationships.filter((relationship) =>
          relationshipMatchesKinds(relationship, definition.relationshipKinds!),
        )
      : [];
    const completeRelatedEntityIds = new Set(completeMatchingRelationships.flatMap((relationship) => {
      if (definition.endpointRole === "source") return [relationship.sourceEntityId];
      if (definition.endpointRole === "target") return [relationship.targetEntityId];
      return [relationship.sourceEntityId, relationship.targetEntityId];
    }));
    const completeMatchingEntities = completeApplicationEntities.filter((entity) =>
      entityMatchesDefinition(entity, definition) &&
      (!definition.endpointRole || completeRelatedEntityIds.has(entity.entityId)),
    );
    const matchingEntityIds = new Set(matchingEntities.map((entity) => entity.entityId));
    const scopedRelationships = matchingRelationships.filter((relationship) =>
      matchingEntityIds.has(relationship.sourceEntityId) &&
      matchingEntityIds.has(relationship.targetEntityId),
    );
    const completeMatchingEntityIds = new Set(completeMatchingEntities.map((entity) => entity.entityId));
    const completeScopedRelationships = completeMatchingRelationships.filter((relationship) =>
      completeMatchingEntityIds.has(relationship.sourceEntityId) &&
      completeMatchingEntityIds.has(relationship.targetEntityId),
    );
    const omittedCount = Math.max(
      0,
      completeMatchingEntities.length - matchingEntities.length +
        completeScopedRelationships.length - scopedRelationships.length,
    );
    return {
      key: definition.key,
      label: definition.label,
      canonicalKinds: definition.canonicalKinds,
      entityIndexes: matchingEntities.flatMap((entity) => {
        const index = entityIndexById.get(entity.entityId);
        return index === undefined ? [] : [index];
      }),
      relationshipIndexes: scopedRelationships.flatMap((relationship) => {
        const index = relationshipIndexById.get(relationship.relationshipId);
        return index === undefined ? [] : [index];
      }),
      ...(omittedCount ? { omittedCount } : {}),
      ...(!completeMatchingEntities.length && !completeScopedRelationships.length
        ? { emptyStateText: EMPTY_GROUP_TEXT }
        : {}),
    };
  });
  return { application, groups };
}
 
export function projectApplicationInventoryOmissionGaps(
  projection: ApplicationInventoryProjection,
  requestedScope: string,
): StructuredEvidenceGap[] {
  return projection.groups.flatMap((group) => group.omittedCount
    ? [{
        gapCategory: "citation-or-compaction-omission",
        requestedScopeAffected: requestedScope,
        application: projection.application,
        entityOrCategory: group.label,
        firstLossStage: "application inventory context compaction",
        sourceFactExistedBeforeLoss: true,
        blockedConclusion: `a complete listing of requested ${group.label.toLocaleLowerCase()} records`,
        typedGapCode: "requested-inventory-records-omitted",
        explanation: `${group.omittedCount} matching ${group.label.toLocaleLowerCase()} record(s) were omitted during context compaction.`,
        proves: ["The requested record category had source-backed matching records before compaction."],
        doesNotProve: ["Omitted records are not evidence of absence."],
        citationIds: [],
        answerEligible: false,
      }]
    : []);
}
 