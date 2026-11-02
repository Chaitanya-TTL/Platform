import type { InvestigationId } from "../kernel/contracts/investigation-identity";
import type { InvestigationLifecycle } from "../kernel/contracts/investigation-lifecycle";
import type { SourceOperationStatus } from "../kernel/contracts/source-operation";
import type { RelationshipGuidanceSection } from "./relationship-guidance";
import type {
  OntologyRelationshipDefinition,
  OntologyRelationshipPath,
  InvestigationKnowledgeGraph,
} from "../plm-brain/contracts/relationship-ontology";

export interface CopilotEntityCandidate {
  entityId: string;
  label: string;
  source?: string;
  nativeId?: string;
  score: number;
  matchBasis: "exact-identifier" | "governed-property" | "relationship-path" | "lexical";
  citationId: string;
}

export type CopilotClaimKind = "fact" | "hypothesis";
export type CopilotCitationKind = "entity" | "relationship" | "evidence" | "finding" | "source" | "evaluation";

export interface CopilotCitation {
  citationId: string;
  kind: CopilotCitationKind;
  label: string;
  source?: string;
  nativeId?: string;
  summary?: string;
}

export interface CopilotSourceContext {
  citationId: string;
  source: string;
  nativeId: string;
  displayName: string;
  status: SourceOperationStatus | "not-started";
  capturedAt?: string;
  freshness: "current" | "stale" | "unknown";
}

export interface CopilotEntityContext {
  entityId: string;
  citationId: string;
  displayName: string;
  kind: string;
  importanceScore?: number;
  identityQuality: "native" | "deterministic-derived" | "provisional";
  source?: string;
  nativeId?: string;
  properties: Readonly<Record<string, string>>;
  freshness: "current" | "stale" | "unknown";
}

export interface CopilotRelationshipContext {
  relationshipId: string;
  citationId: string;
  kind: string;
  family?: string;
  sourceEntityId: string;
  sourceCitationId: string;
  sourceNativeId?: string;
  targetEntityId: string;
  targetCitationId: string;
  targetNativeId?: string;
  evidenceCitationIds: readonly string[];
  semanticGuidanceAvailable: boolean;
  identitySupported: boolean;
  assertion?: string;
  status?: string;
  strength?: string;
  evidenceRuleId?: string;
  provenance?: {
    provider?: string;
    authority?: string;
    observedAt?: string;
    ontologyVersion?: string;
  };
  summary?: string;
}

export interface CopilotEvidenceContext {
  evidenceId: string;
  citationId: string;
  kind: string;
  summary: string;
  source?: string;
  capturedAt?: string;
  freshness: "current" | "stale" | "unknown";
}

export interface CopilotFindingContext {
  findingId: string;
  citationId: string;
  kind: string;
  title: string;
  summary: string;
  subjectEntityIds: readonly string[];
  evidenceCitationIds: readonly string[];
}

export interface CopilotUnresolvedEvaluationContext {
  citationId: string;
  ruleId: string;
  relationshipType: string;
  sourceApplication: string;
  targetApplication: string;
  semanticGuidanceAvailable: boolean;
  reasonCode: string;
  reason: string;
  sourceEntityIds: readonly string[];
  targetEntityIds: readonly string[];
  evidenceCitationIds: readonly string[];
}

export interface CopilotConflictContext {
  property: string;
  values: readonly { entityId: string; source?: string; value: string }[];
}

export interface EntityImportance {
  score: number;
  evidenceCount: number;
  relationshipCount: number;
  impactCount: number;
  crossApplicationCount: number;
  ontologyStrength: number;
}

export interface ReasoningPath {
  path: OntologyRelationshipPath;
  score: number;
  relationshipStrength: number;
  evidenceStrength: number;
  ontologyConfidence: number;
  crossApplicationBonus: number;
}

export interface EngineeringFinding {
  id: string;
  kind: string;
  title: string;
  summary: string;
  score: number;
  entityIds: readonly string[];
  relationshipIds: readonly string[];
  citationIds: readonly string[];
}

export interface ReasoningNarrative {
  id: string;
  text: string;
  engineeringMeaning: string;
  impactRationale?: string;
  score: number;
  entityIds: readonly string[];
  relationshipIds: readonly string[];
  citationIds: readonly string[];
}

export interface EngineeringImpactChain {
  id: string;
  sourceEntityId: string;
  impactedEntityId: string;
  relationshipIds: readonly string[];
  relationshipSequence: OntologyRelationshipPath["steps"];
  supportingEvidence: readonly string[];
  citationIds: readonly string[];
  engineeringExplanation: string;
  confidence: number;
  impactRationale: string;
  pathScore: number;
}

export interface MissingEvidence {
  id: string;
  category: string;
  description: string;
  entityIds: readonly string[];
  citationIds: readonly string[];
}

export interface InvestigationReasoningSummary {
  crossSystemSummary: string;
  relationshipCount: number;
  relationshipSummary: string;
  applicationCoverage: Readonly<Record<string, number>>;
  keyDependencies: readonly string[];
  mostConnectedEntities: readonly string[];
  highestValueRelationships: readonly string[];
  strongestEvidence: readonly string[];
  strongestImpactChains: readonly string[];
}

export interface RelationshipStageCounts {
  relationshipCount: number;
  impactPathCount: number;
  impactChainCount: number;
  unresolvedRelationshipCount: number;
  evidenceCount: number;
}

export interface RelationshipFlowDiagnostics {
  ontologyGraph: RelationshipStageCounts & { relationshipDefinitionCount: number };
  reasoningPackage: RelationshipStageCounts;
  engineeringBrief: RelationshipStageCounts & {
    relationshipNarrativeCount: number;
    impactNarrativeCount: number;
  };
  copilotContext: RelationshipStageCounts;
}

export interface ReasoningPackage {
  entityImportance: Readonly<Record<string, EntityImportance>>;
  primaryEntities: readonly (CopilotEntityContext & { importance: EntityImportance })[];
  keyDependencies: readonly ReasoningPath[];
  impactChains: readonly EngineeringImpactChain[];
  strongestEvidence: readonly CopilotEvidenceContext[];
  engineeringFindings: readonly EngineeringFinding[];
  relationshipNarratives: readonly ReasoningNarrative[];
  impactNarratives: readonly ReasoningNarrative[];
  unresolvedRelationships: readonly CopilotUnresolvedEvaluationContext[];
  missingEvidence: readonly MissingEvidence[];
  investigationSummary: InvestigationReasoningSummary;
}

export interface EngineeringBrief {
  executiveSummary: string;
  crossSystemSummary: string;
  primaryEntities: readonly (
    Pick<CopilotEntityContext, "entityId" | "citationId" | "displayName" | "kind" | "source" | "nativeId"> & {
      importance: EntityImportance;
    }
  )[];
  majorRelationships: readonly CopilotRelationshipContext[];
  relationshipNarratives: ReasoningPackage["relationshipNarratives"];
  impactNarratives: ReasoningPackage["impactNarratives"];
  relationshipEvidence: readonly CopilotEvidenceContext[];
  engineeringInsights: readonly EngineeringFinding[];
  topFindings: readonly EngineeringFinding[];
  topImpactChains: readonly EngineeringImpactChain[];
  strongestEvidence: readonly CopilotEvidenceContext[];
  missingEvidence: readonly MissingEvidence[];
  unresolvedRelationships: readonly CopilotUnresolvedEvaluationContext[];
  recommendedInvestigationAreas: readonly string[];
  relationshipFlow: Omit<RelationshipFlowDiagnostics, "copilotContext">;
}

export interface CopilotContextPacket {
  schemaVersion: "1.0";
  investigationId: InvestigationId;
  snapshotRevision: number;
  lifecycle: InvestigationLifecycle;
  subject: string;
  userMessage: string;
  questionIntent: "summary" | "relationship" | "impact" | "dependency" | "root-cause" | "evidence" | "risk" | "change-analysis";
  entityCandidates: readonly CopilotEntityCandidate[];
  selectedEntityIds: readonly string[];
  entityConfidence: number;
  retrievalConfidence: {
    score: number;
    threshold: number;
    belowThreshold: boolean;
    components: {
      evidenceSupport: number;
      relationshipSupport: number;
      retrievalCoverage: number;
      groundingAvailability: number;
    };
    method: "heuristic";
  };
  ambiguity: { detected: boolean; clarificationRequired: boolean; notice?: string };
  relationshipPaths: readonly OntologyRelationshipPath[];
  impactPaths: readonly OntologyRelationshipPath[];
  ontologyVersion?: string;
  knowledgeGraphSummary?: InvestigationKnowledgeGraph["knowledgeGraphSummary"];
  relationshipDefinitions: readonly OntologyRelationshipDefinition[];
  impactSummary: {
    classification: "potential";
    pathCount: number;
    impactedEntityIds: readonly string[];
    entitiesByKind: Readonly<Record<string, number>>;
    entitiesByApplication: Readonly<Record<string, number>>;
  };
  reasoningPackage: ReasoningPackage;
  engineeringBrief: EngineeringBrief;
  relationshipFlow: RelationshipFlowDiagnostics;
  knowledgeGraph?: InvestigationKnowledgeGraph;
  sourceSelections: readonly CopilotSourceContext[];
  entities: readonly CopilotEntityContext[];
  relationships: readonly CopilotRelationshipContext[];
  relationshipGuidance: readonly RelationshipGuidanceSection[];
  findings: readonly CopilotFindingContext[];
  unresolvedEvaluations: readonly CopilotUnresolvedEvaluationContext[];
  evidence: readonly CopilotEvidenceContext[];
  evidenceGroups: {
    direct: readonly string[];
    relationship: readonly string[];
    dependency: readonly string[];
    impact: readonly string[];
  };
  conflicts: readonly CopilotConflictContext[];
  citations: readonly CopilotCitation[];
  uncertainties: readonly string[];
  grounding: {
    hasCanonicalEvidence: boolean;
    partialSources: readonly string[];
    staleSources: readonly string[];
    unsupportedIdentifiers: readonly string[];
  };
  omissions: {
    categories: readonly string[];
    omittedCounts: Readonly<Record<string, number>>;
    maxContextChars: number;
  };
}

export interface CopilotClaim {
  text: string;
  kind: CopilotClaimKind;
  citationIds: readonly string[];
}

export interface CopilotRecommendation {
  text: string;
  rationale: string;
  citationIds: readonly string[];
  approvalRequired: true;
}

export interface CopilotAnswer {
  answer: string;
  claims: readonly CopilotClaim[];
  recommendations: readonly CopilotRecommendation[];
  uncertainties: readonly string[];
  followUpQuestions: readonly string[];
  snapshotRevision: number;
  citations?: readonly CopilotCitation[];
}