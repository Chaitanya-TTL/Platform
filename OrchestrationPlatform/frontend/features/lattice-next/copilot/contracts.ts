import type { InvestigationId } from "../kernel/contracts/investigation-identity";
import type { InvestigationLifecycle } from "../kernel/contracts/investigation-lifecycle";
import type { SourceOperationStatus } from "../kernel/contracts/source-operation";

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
  assertion?: string;
  status?: string;
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

export interface CopilotContextPacket {
  schemaVersion: "1.0";
  investigationId: InvestigationId;
  snapshotRevision: number;
  lifecycle: InvestigationLifecycle;
  subject: string;
  userMessage: string;
  sourceSelections: readonly CopilotSourceContext[];
  entities: readonly CopilotEntityContext[];
  relationships: readonly CopilotRelationshipContext[];
  findings: readonly CopilotFindingContext[];
  unresolvedEvaluations: readonly CopilotUnresolvedEvaluationContext[];
  evidence: readonly CopilotEvidenceContext[];
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