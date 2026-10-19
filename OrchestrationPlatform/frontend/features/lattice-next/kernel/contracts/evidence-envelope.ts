import type { ExecutionIdentity } from "./investigation-identity";

export type EvidenceAuthority =
  | "source-authoritative"
  | "source-cached"
  | "backend-derived"
  | "frontend-derived"
  | "synthetic"
  | "unavailable";

export interface EvidenceValidation {
  status: "accepted" | "rejected";
  schemaVersion: string;
  issues: readonly string[];
}

export interface EvidenceEnvelope<TPayload = unknown> {
  envelopeVersion: "1.0";
  identity: ExecutionIdentity;
  authority: EvidenceAuthority;
  observedAt: string;
  freshness: "current" | "stale" | "unknown";
  validation: EvidenceValidation;
  warnings: readonly string[];
  payload: TPayload;
}
