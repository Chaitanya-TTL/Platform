import type { ExecutionIdentity } from "./investigation-identity";
import type { EvidenceEnvelope } from "./evidence-envelope";
import type { SourceOperationError, SourceOperationStatus } from "./source-operation";

export interface SourceOperationResult<TPayload = unknown> {
  identity: ExecutionIdentity;
  status: Exclude<SourceOperationStatus, "requested" | "running">;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  evidence?: EvidenceEnvelope<TPayload>;
  warnings: readonly string[];
  error?: SourceOperationError;
}
