import type {
  LatticeRelationshipOntology,
  OntologyEvidenceRule,
  OntologyRelationshipDefinition,
} from "../contracts/relationship-ontology";

const BLOCK = /```lattice-relationship-ontology\s*([\s\S]*?)```/g;
const OPERATORS = new Set(["exact-scalar", "exact-list-reference"]);
const STATUSES = new Set(["CONFIRMED", "SOURCE_EXPLICIT", "RULE_DERIVED", "CALCULATED", "POTENTIAL"]);
const STRENGTHS = new Set(["STRONG", "MEDIUM", "WEAK"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Relationship ontology ${path} must be a non-empty string.`);
  return value.trim();
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.length) throw new Error(`Relationship ontology ${path} must be a non-empty array.`);
  return [...new Set(value.map((item, index) => requiredString(item, `${path}[${index}]`)))];
}

function parseEvidenceRule(value: unknown, path: string): OntologyEvidenceRule {
  if (!isRecord(value)) throw new Error(`Relationship ontology ${path} must be an object.`);
  const operator = requiredString(value.operator, `${path}.operator`);
  const status = requiredString(value.status, `${path}.status`);
  const strength = requiredString(value.strength, `${path}.strength`);
  if (!OPERATORS.has(operator)) throw new Error(`Relationship ontology ${path}.operator is unsupported.`);
  if (!STATUSES.has(status)) throw new Error(`Relationship ontology ${path}.status is unsupported.`);
  if (!STRENGTHS.has(strength)) throw new Error(`Relationship ontology ${path}.strength is unsupported.`);
  return {
    id: requiredString(value.id, `${path}.id`),
    sourcePath: requiredString(value.sourcePath, `${path}.sourcePath`),
    targetPath: requiredString(value.targetPath, `${path}.targetPath`),
    operator: operator as OntologyEvidenceRule["operator"],
    mechanism: requiredString(value.mechanism, `${path}.mechanism`),
    status: status as OntologyEvidenceRule["status"],
    strength: strength as OntologyEvidenceRule["strength"],
    authority: requiredString(value.authority, `${path}.authority`),
  };
}

function parseDefinition(value: unknown, index: number): OntologyRelationshipDefinition {
  const path = `relationshipDefinitions[${index}]`;
  if (!isRecord(value) || !isRecord(value.forward) || !isRecord(value.inverse))
    throw new Error(`Relationship ontology ${path} must define forward and inverse semantics.`);
  if (typeof value.impactTraversal !== "boolean" || !Array.isArray(value.evidenceRules) || !value.evidenceRules.length)
    throw new Error(`Relationship ontology ${path} must define impactTraversal and evidenceRules.`);
  return {
    id: requiredString(value.id, `${path}.id`),
    sourceApplications: stringArray(value.sourceApplications, `${path}.sourceApplications`),
    sourceKinds: stringArray(value.sourceKinds, `${path}.sourceKinds`),
    targetApplications: stringArray(value.targetApplications, `${path}.targetApplications`),
    targetKinds: stringArray(value.targetKinds, `${path}.targetKinds`),
    forward: {
      type: requiredString(value.forward.type, `${path}.forward.type`),
      meaning: requiredString(value.forward.meaning, `${path}.forward.meaning`),
    },
    inverse: {
      type: requiredString(value.inverse.type, `${path}.inverse.type`),
      meaning: requiredString(value.inverse.meaning, `${path}.inverse.meaning`),
    },
    impactTraversal: value.impactTraversal,
    evidenceRules: value.evidenceRules.map((rule, ruleIndex) => parseEvidenceRule(rule, `${path}.evidenceRules[${ruleIndex}]`)),
  };
}

export function parseRelationshipOntology(markdown: string): LatticeRelationshipOntology {
  const blocks = [...markdown.matchAll(BLOCK)];
  if (blocks.length !== 1) throw new Error(`Expected exactly one lattice-relationship-ontology block; found ${blocks.length}.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(blocks[0][1]);
  } catch {
    throw new Error("The lattice relationship ontology block is not valid JSON.");
  }
  if (!isRecord(parsed)) throw new Error("The lattice relationship ontology root must be an object.");
  const schemaVersion = requiredString(parsed.schemaVersion, "schemaVersion");
  const ontologyVersion = requiredString(parsed.ontologyVersion, "ontologyVersion");
  const applications = stringArray(parsed.applications, "applications");
  if (!Array.isArray(parsed.relationshipDefinitions) || !parsed.relationshipDefinitions.length)
    throw new Error("Relationship ontology relationshipDefinitions must be a non-empty array.");
  const relationshipDefinitions = parsed.relationshipDefinitions.map(parseDefinition);
  const definitionIds = relationshipDefinitions.map((definition) => definition.id);
  if (new Set(definitionIds).size !== definitionIds.length)
    throw new Error("Relationship ontology contains duplicate relationship definition IDs.");
  const rules = relationshipDefinitions.flatMap((definition) => definition.evidenceRules.map((rule) => `${definition.id}:${rule.id}`));
  if (new Set(rules).size !== rules.length) throw new Error("Relationship ontology contains duplicate evidence rule IDs.");
  for (const [index, template] of (Array.isArray(parsed.impactPathTemplates) ? parsed.impactPathTemplates : []).entries()) {
    if (!isRecord(template)) throw new Error(`Relationship ontology impactPathTemplates[${index}] must be an object.`);
    const referenced = stringArray(template.relationshipDefinitionIds, `impactPathTemplates[${index}].relationshipDefinitionIds`);
    if (referenced.some((id) => !definitionIds.includes(id)))
      throw new Error(`Relationship ontology impactPathTemplates[${index}] references an unknown relationship definition.`);
  }
  const impactPathTemplates = (parsed.impactPathTemplates as Record<string, unknown>[] | undefined ?? []).map((template, index) => ({
    id: requiredString(template.id, `impactPathTemplates[${index}].id`),
    relationshipDefinitionIds: stringArray(template.relationshipDefinitionIds, `impactPathTemplates[${index}].relationshipDefinitionIds`),
    meaning: requiredString(template.meaning, `impactPathTemplates[${index}].meaning`),
  }));
  return { schemaVersion, ontologyVersion, applications, relationshipDefinitions, impactPathTemplates };
}
