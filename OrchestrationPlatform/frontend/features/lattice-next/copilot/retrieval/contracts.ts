export type RetrievalIntent =
  | "document"
  | "summary"
  | "relationship"
  | "impact"
  | "dependency"
  | "root-cause"
  | "evidence"
  | "risk"
  | "change-analysis";

export interface SourceReference {
  readonly sourceSystem: string;
  readonly nativeDocumentId: string;
  readonly contentId?: string;
  readonly uri?: string;
}

export interface RetrievalAccessScope {
  readonly tenantId: string;
  readonly classification: "public" | "internal" | "restricted";
  readonly allowedPrincipalIds: readonly string[];
  readonly allowedGroupIds: readonly string[];
  readonly sourceAclRef?: string;
  readonly policyVersion: string;
}

export interface RetrievalPrincipalScope {
  readonly tenantId: string;
  readonly principalId: string;
  readonly groupIds: readonly string[];
  readonly applicationEntitlements: readonly string[];
  readonly policyVersion: string;
  readonly origin: "server-authenticated" | "test-fixture";
}

export interface RetrievalDocument {
  readonly schemaVersion: "1.0";
  readonly documentId: string;
  readonly sourceApplication: string;
  readonly sourceSystem: string;
  readonly documentType: string;
  readonly title: string;
  readonly revision: string;
  readonly lifecycleState: string;
  readonly canonicalSubjectIds: readonly string[];
  readonly entityIds: readonly string[];
  readonly relationshipIds: readonly string[];
  readonly accessScope: RetrievalAccessScope;
  readonly sourceReference: SourceReference;
  readonly extractedAt: string;
  readonly contentHash: string;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface RetrievalChunk {
  readonly schemaVersion: "1.0";
  readonly chunkId: string;
  readonly documentId: string;
  readonly text: string;
  readonly sectionPath: readonly string[];
  readonly chunkIndex: number;
  readonly tokenCount: number;
  readonly entityIds: readonly string[];
  readonly canonicalSubjectIds: readonly string[];
  readonly sourceApplication: string;
  readonly revision: string;
  readonly accessScope: RetrievalAccessScope;
  readonly contentHash: string;
}

export type RetrievalChunkMetadata = Omit<RetrievalChunk, "text" | "accessScope"> & {
  readonly accessScope?: RetrievalAccessScope;
  readonly lifecycleEligible: boolean;
  readonly revisionEligible: boolean;
  readonly overlapGroupId?: string;
  readonly sourceSystem: string;
  readonly documentType: string;
  readonly lifecycleState: string;
  readonly sourceReference: SourceReference;
  readonly extractedAt: string;
  readonly documentContentHash: string;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
};

export interface RetrievalQuery {
  readonly schemaVersion: "1.0";
  readonly originalQuestion: string;
  readonly normalizedQuestion: string;
  readonly investigationId: string;
  readonly intent: RetrievalIntent;
  readonly canonicalSubjectIds: readonly string[];
  readonly selectedEntityIds: readonly string[];
  readonly relationshipEndpointEntityIds: readonly string[];
  readonly sourceApplicationFilters: readonly string[];
  readonly documentTypeFilters: readonly string[];
  readonly accessScope: RetrievalPrincipalScope;
  readonly keywordQuery: string;
  readonly semanticQuery: string;
  readonly requestedTopK: number;
}

export interface RetrievalScoreBreakdown {
  readonly semanticScore: number;
  readonly keywordScore: number;
  readonly subjectScore: number;
  readonly entityScore: number;
  readonly sourceApplicationScore: number;
  readonly recencyScore: number;
  readonly finalScore: number;
}

export interface RetrievalCandidate {
  readonly chunk: RetrievalChunkMetadata;
  readonly semanticScore: number;
  readonly keywordScore: number;
  readonly subjectScore: number;
  readonly entityScore: number;
  readonly sourceApplicationScore: number;
  readonly recencyScore: number;
  readonly finalScore: number;
  readonly rankingReasons: readonly string[];
}

export type RetrievalCandidateMetadata = Pick<RetrievalCandidate, "chunk" | "rankingReasons"> & {
  readonly semanticScore?: number;
  readonly keywordScore?: number;
};

export interface RetrievalEvidence {
  readonly schemaVersion: "1.0";
  readonly evidenceId: string;
  readonly citationId: string;
  readonly chunkId: string;
  readonly documentId: string;
  readonly sourceApplication: string;
  readonly excerpt: string;
  readonly sectionPath: readonly string[];
  readonly revision: string;
  readonly sourceReference: SourceReference;
  readonly retrievalScore: number;
  readonly accessDecision: {
    readonly decision: "allowed";
    readonly policyVersion: string;
    readonly decidedAt: string;
  };
  readonly provenance: {
    readonly authority: "retrieved-document";
    readonly sourceSystem: string;
    readonly extractedAt: string;
    readonly contentHash: string;
  };
}

export type RetrievalRejectionReason =
  | "missing-principal"
  | "missing-tenant"
  | "tenant-mismatch"
  | "missing-policy-version"
  | "stale-policy-version"
  | "missing-access-scope"
  | "missing-access-metadata"
  | "principal-not-allowed"
  | "group-not-allowed"
  | "application-not-entitled"
  | "lifecycle-ineligible"
  | "revision-ineligible"
  | "source-application-filter"
  | "document-type-filter"
  | "empty-chunk-text"
  | "authorization-error";

export interface RetrievalRejection {
  readonly chunkId: string;
  readonly documentId?: string;
  readonly reasonCode: RetrievalRejectionReason;
}

export interface RetrievalDiagnosticsQuery {
  readonly originalQuestion: string;
  readonly normalizedQuestion: string;
  readonly intent: RetrievalIntent;
  readonly keywordQuery: string;
  readonly semanticQuery: string;
}

export interface RetrievalDiagnostics {
  readonly schemaVersion: "1.0";
  readonly requestId: string;
  readonly investigationId: string;
  readonly snapshotRevision: number;
  readonly query: RetrievalDiagnosticsQuery;
  readonly candidateCount: number;
  readonly filteredCount: number;
  readonly selectedCount: number;
  readonly rejectedCandidates: readonly RetrievalRejection[];
  readonly scoreBreakdowns: readonly {
    readonly chunkId: string;
    readonly scores: RetrievalScoreBreakdown;
  }[];
  readonly selectedChunkIds: readonly string[];
  readonly duplicateChunkIds: readonly string[];
  readonly omissionReasonCodes: readonly string[];
  readonly retrievalDurationMs: number;
  readonly contextCharactersConsumed: number;
}

export interface RetrievalSearchResult {
  readonly schemaVersion: "1.0";
  readonly status: "complete" | "authorization-failed";
  readonly evidence: readonly RetrievalEvidence[];
  readonly diagnostics: RetrievalDiagnostics;
}
