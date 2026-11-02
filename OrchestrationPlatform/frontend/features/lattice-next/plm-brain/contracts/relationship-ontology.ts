import type { EngineeringIntelligenceInvestigationV1 } from "../../contracts/intelligence-v1";

export type OntologyEvidenceOperator = "exact-scalar" | "exact-list-reference";
export type OntologyRelationshipStatus = "CONFIRMED" | "SOURCE_EXPLICIT" | "RULE_DERIVED" | "CALCULATED" | "POTENTIAL";
export type OntologyRelationshipStrength = "STRONG" | "MEDIUM" | "WEAK";

export interface OntologyEvidenceRule {
  id: string;
  sourcePath: string;
  targetPath: string;
  operator: OntologyEvidenceOperator;
  mechanism: string;
  status: OntologyRelationshipStatus;
  strength: OntologyRelationshipStrength;
  authority: string;
}

export interface OntologyRelationshipDefinition {
  id: string;
  sourceApplications: string[];
  sourceKinds: string[];
  targetApplications: string[];
  targetKinds: string[];
  forward: { type: string; meaning: string };
  inverse: { type: string; meaning: string };
  impactTraversal: boolean;
  evidenceRules: OntologyEvidenceRule[];
}

export interface OntologyImpactPathTemplate {
  id: string;
  relationshipDefinitionIds: string[];
  meaning: string;
}

export interface LatticeRelationshipOntology {
  schemaVersion: string;
  ontologyVersion: string;
  applications: string[];
  relationshipDefinitions: OntologyRelationshipDefinition[];
  impactPathTemplates: OntologyImpactPathTemplate[];
}

export interface OntologyEvidenceObservation {
  id: string;
  citationId: string;
  application?: string;
  entityId: string;
  path: string;
  value: string;
  provider: string;
  observedAt: string;
  authority: string;
}

export interface OntologyResolvedRelationship {
  id: string;
  definitionId: string;
  evidenceRuleId: string;
  sourceEntityId: string;
  targetEntityId: string;
  forwardType: string;
  forwardMeaning: string;
  inverseType: string;
  inverseMeaning: string;
  status: OntologyRelationshipStatus;
  strength: OntologyRelationshipStrength;
  mechanism: string;
  impactTraversal: boolean;
  evidence: OntologyEvidenceObservation[];
  evidenceIds: string[];
  canonicalRelationshipIds: string[];
  citationIds: string[];
  provenance: {
    authority: string;
    provider: string;
    ontologyVersion: string;
    observedAt: string;
    snapshotRevision: number;
  };
}

export interface OntologyUnresolvedEvaluation {
  id: string;
  definitionId: string;
  sourceApplication: string;
  targetApplication: string;
  sourceCandidates: string[];
  targetCandidates: string[];
  reason: "no-compatible-endpoints" | "evidence-not-found";
  evidenceRuleIds: string[];
  candidateCount: number;
  citationIds: string[];
}

export interface OntologyRelationshipPath {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationshipIds: string[];
  steps: Array<{
    relationshipId: string;
    fromEntityId: string;
    toEntityId: string;
    traversal: "forward" | "inverse";
    type: string;
    meaning: string;
  }>;
  meanings: string[];
  status: OntologyRelationshipStatus;
  strength: OntologyRelationshipStrength;
  impactEligible: boolean;
  citationIds: string[];
}

export interface OntologyImpactChain {
  id: string;
  sourceEntityId: string;
  impactedEntityId: string;
  relationshipIds: string[];
  relationshipSequence: OntologyRelationshipPath["steps"];
  supportingEvidenceIds: string[];
  citationIds: string[];
  engineeringExplanation: string;
  confidence: number;
  impactRationale: string;
  status: OntologyRelationshipStatus;
  strength: OntologyRelationshipStrength;
}

export interface InvestigationKnowledgeGraph {
  schemaVersion: "1.0";
  ontologyVersion: string;
  derivedOnRead?: boolean;
  ontology: LatticeRelationshipOntology;
  investigationId: string;
  snapshotRevision: number;
  entities: Array<{
    id: string;
    kind: string;
    application?: string;
    label: string;
    nativeId?: string;
    citationId: string;
    provenance: { provider: string; authority: string; observedAt: string; freshness: string };
  }>;
  canonicalRelationships: Array<{
    id: string;
    sourceEntityId: string;
    targetEntityId: string;
    type: string;
    citationId: string;
    evidenceIds: string[];
    evidenceCitationIds: string[];
    provenance: { provider: string; authority: string; observedAt: string };
  }>;
  resolvedRelationships: OntologyResolvedRelationship[];
  unresolvedEvaluations: OntologyUnresolvedEvaluation[];
  relationshipPaths: OntologyRelationshipPath[];
  impactPaths: OntologyRelationshipPath[];
  impactChains?: OntologyImpactChain[];
  knowledgeGraphSummary?: {
    entityCount: number;
    relationshipCount: number;
    impactPathCount: number;
    evidenceCount: number;
    applicationCoverage: Record<string, number>;
    ontologyVersion: string;
    maxTraversalDepth: number;
  };
  relationshipEvidence: OntologyEvidenceObservation[];
  crossApplicationMappings: Array<{
    sourceApplication: string;
    targetApplication: string;
    relationshipIds: string[];
  }>;
  traversalIndexes: {
    outgoing: Record<string, string[]>;
    incoming: Record<string, string[]>;
  };
  confidenceMetadata: {
    entityCount: number;
    relationshipCount: number;
    unresolvedCount: number;
    relationshipCoverage: number;
    maxTraversalDepth: number;
  };
}

export type OntologyEvaluationInput = Pick<
  EngineeringIntelligenceInvestigationV1,
  "investigationId" | "entities" | "relationships" | "evidence"
> & { snapshotRevision: number };
