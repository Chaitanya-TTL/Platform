import type { AcceptedEvidenceEnvelope, EvidenceId, EvidenceRejection } from "../evidence/evidence-contracts";
import type { InvestigationId } from "../contracts/investigation-identity";

export interface EvidenceQuery {
  readonly investigationId: InvestigationId;
  readonly revision?: number;
  readonly executionId?: string;
  readonly source?: string;
}
export interface EvidenceManifestEntry {
  readonly evidenceId: EvidenceId;
  readonly investigationId: InvestigationId;
  readonly investigationRevision: number;
  readonly executionId: string;
  readonly source: string;
  readonly operation: string;
  readonly authority: string;
  readonly schemaName: string;
  readonly schemaVersion: string;
  readonly payloadHash: string;
  readonly status: "accepted" | "rejected";
  readonly storedAt: string;
}
export interface EvidenceRepository {
  putAccepted(evidence: AcceptedEvidenceEnvelope): Promise<"created" | "existing">;
  putRejected(rejection: EvidenceRejection): Promise<"created" | "existing">;
  getAccepted(id: EvidenceId): Promise<AcceptedEvidenceEnvelope | undefined>;
  getRejected(id: EvidenceId): Promise<EvidenceRejection | undefined>;
  query(query: EvidenceQuery): Promise<readonly EvidenceManifestEntry[]>;
}
