import type { ExecutionIdentity, InvestigationId } from "../contracts/investigation-identity";

export const IMMUTABLE_EVIDENCE_ENVELOPE_VERSION = "2.0" as const;

export type EvidenceId = string & { readonly __brand: "EvidenceId" };
export type EvidencePayloadHash = string & { readonly __brand: "EvidencePayloadHash" };
export const asEvidenceId = (value: string): EvidenceId => value as EvidenceId;
export const asEvidencePayloadHash = (value: string): EvidencePayloadHash => value as EvidencePayloadHash;

export type EvidenceAuthority =
  | "source-authoritative"
  | "source-cached"
  | "backend-derived"
  | "frontend-derived"
  | "synthetic"
  | "mocked"
  | "hardcoded"
  | "unavailable";

export type EvidenceFreshness = "current" | "stale" | "unknown" | "not-applicable";
export type EvidenceCompleteness = "complete" | "partial" | "empty" | "unavailable";
export type EvidenceValidationStatus = "accepted" | "rejected";
export type EvidenceIssueSeverity = "error" | "warning";

export interface EvidenceIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly severity: EvidenceIssueSeverity;
}

export interface EvidenceSchemaIdentity {
  readonly name: string;
  readonly version: string;
}

export interface EvidenceSourceRecordIdentity {
  readonly source: string;
  readonly nativeId: string;
  readonly nativeRevision?: string;
}

export interface EvidenceArtifactReference {
  readonly artifactId: string;
  readonly mediaType?: string;
  readonly location?: string;
  readonly byteLength?: number;
}

export interface EvidenceProvenance {
  readonly provider: string;
  readonly sourceRoute?: string;
  readonly sourceRecord?: EvidenceSourceRecordIdentity;
  readonly artifact?: EvidenceArtifactReference;
  readonly observedAt: string;
}

export interface EvidenceValidationResult {
  readonly status: EvidenceValidationStatus;
  readonly schema: EvidenceSchemaIdentity;
  readonly validatedAt: string;
  readonly validator: string;
  readonly issues: readonly EvidenceIssue[];
}

export interface EvidenceCandidate<TPayload = unknown> {
  readonly identity: ExecutionIdentity;
  readonly schema: EvidenceSchemaIdentity;
  readonly authority: EvidenceAuthority;
  readonly freshness: EvidenceFreshness;
  readonly completeness: EvidenceCompleteness;
  readonly capturedAt: string;
  readonly receivedAt: string;
  readonly provenance: EvidenceProvenance;
  readonly payload: TPayload;
  readonly warnings: readonly string[];
}

export interface ImmutableEvidenceEnvelope<TPayload = unknown> {
  readonly envelopeVersion: typeof IMMUTABLE_EVIDENCE_ENVELOPE_VERSION;
  readonly evidenceId: EvidenceId;
  readonly investigationId: InvestigationId;
  readonly investigationRevision: number;
  readonly execution: ExecutionIdentity;
  readonly schema: EvidenceSchemaIdentity;
  readonly authority: EvidenceAuthority;
  readonly freshness: EvidenceFreshness;
  readonly completeness: EvidenceCompleteness;
  readonly capturedAt: string;
  readonly receivedAt: string;
  readonly payloadHash: EvidencePayloadHash;
  readonly provenance: EvidenceProvenance;
  readonly validation: EvidenceValidationResult;
  readonly warnings: readonly string[];
  readonly payload: TPayload;
}

export type AcceptedEvidenceEnvelope<TPayload = unknown> = ImmutableEvidenceEnvelope<TPayload> & {
  readonly validation: EvidenceValidationResult & { readonly status: "accepted" };
};

export interface EvidenceRejection<TPayload = unknown> {
  readonly status: "rejected";
  readonly evidenceId: EvidenceId;
  readonly investigationId: InvestigationId;
  readonly execution: ExecutionIdentity;
  readonly schema: EvidenceSchemaIdentity;
  readonly authority: EvidenceAuthority;
  readonly payloadHash: EvidencePayloadHash;
  readonly receivedAt: string;
  readonly provenance: EvidenceProvenance;
  readonly validation: EvidenceValidationResult & { readonly status: "rejected" };
  readonly warnings: readonly string[];
  readonly payload: TPayload;
}

export type EvidenceDecision<TPayload = unknown> =
  | { readonly status: "accepted"; readonly evidence: AcceptedEvidenceEnvelope<TPayload> }
  | EvidenceRejection<TPayload>;

export interface EvidenceSet {
  readonly investigationId: InvestigationId;
  readonly investigationRevision: number;
  readonly evidenceIds: readonly EvidenceId[];
  readonly rejectedEvidenceIds: readonly EvidenceId[];
}
