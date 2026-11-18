import type {
  OntologyImpactChain,
  OntologyRelationshipPath,
  OntologyResolvedRelationship,
  InvestigationKnowledgeGraph,
} from "./relationship-ontology";

export const IMPACT_EVIDENCE_SERVICE_V1 = "1.0" as const;

export interface PlmBrainResolveEntityRequest {
  candidateEntityId: string;
}

export interface PlmBrainEntityResolutionResponse {
  contractVersion: typeof IMPACT_EVIDENCE_SERVICE_V1;
  investigationId: string;
  requestId: string;
  traceId: string;
  disposition: "Resolved" | "Ambiguous" | "Unresolved";
  entity?: {
    system: string;
    entityType: string;
    canonicalId: string;
    displayName: string;
  };
  candidateIds: string[];
  diagnostics: string[];
}

export interface PlmBrainImpactEvidenceRequest {
  subjectEntityId: string;
  scope: {
    relationshipTypes: string[];
    maxHops: number | null;
    sourceSystems: string[];
    asOf: string | null;
  };
}

export interface ImpactEvidenceSourceV1 {
  evidenceId: string;
  sourceType: string;
  sourceSystem: string;
  recordId: string;
  revision: string | null;
  location: string | null;
  deepLink: string | null;
  provenanceId: string;
  authorizationDecisionId: string;
  citationId: string | null;
  authority: string;
  provider: string;
  observedAt: string;
}

export interface ImpactEvidenceResponseV1 {
  investigationId: string;
  relationships: Array<Pick<
    OntologyResolvedRelationship,
    | "id"
    | "sourceEntityId"
    | "targetEntityId"
    | "forwardType"
    | "forwardMeaning"
    | "inverseMeaning"
    | "status"
    | "strength"
    | "evidenceIds"
    | "citationIds"
  >>;
  paths: Array<Pick<
    OntologyRelationshipPath,
    | "id"
    | "sourceEntityId"
    | "targetEntityId"
    | "relationshipIds"
    | "steps"
    | "meanings"
    | "status"
    | "strength"
    | "impactEligible"
    | "citationIds"
  > & { entityIds: string[] }>;
  chains: Array<Pick<
    OntologyImpactChain,
    | "id"
    | "sourceEntityId"
    | "impactedEntityId"
    | "relationshipIds"
    | "relationshipSequence"
    | "supportingEvidenceIds"
    | "citationIds"
    | "engineeringExplanation"
    | "confidence"
    | "impactRationale"
    | "status"
    | "strength"
  >>;
  sources: ImpactEvidenceSourceV1[];
  sourceVersion: string;
  ontologyVersion: string;
  authorizationDecisionId: string;
  requestId: string;
  traceId: string;
}

export interface PlmBrainImpactEvidenceResponse {
  contractVersion: typeof IMPACT_EVIDENCE_SERVICE_V1;
  evidence: ImpactEvidenceResponseV1;
}

export type AuthoritativeImpactGraph = InvestigationKnowledgeGraph;
