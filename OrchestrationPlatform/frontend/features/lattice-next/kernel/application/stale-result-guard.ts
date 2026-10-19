import type { ExecutionIdentity, InvestigationIdentity } from "../contracts/investigation-identity";
import type { SourceExecutionSnapshot } from "../contracts/investigation-snapshot";

export interface StaleResultDecision {
  accepted: boolean;
  reason?: string;
}

export const executionKey = (identity: ExecutionIdentity): string =>
  [identity.source, identity.operation, identity.attempt].join(":");

export function assessExecutionResult(
  current: InvestigationIdentity,
  active: SourceExecutionSnapshot | undefined,
  incoming: ExecutionIdentity,
): StaleResultDecision {
  if (incoming.investigationId !== current.investigationId)
    return { accepted: false, reason: "investigation-id-mismatch" };
  if (incoming.revision !== current.revision)
    return { accepted: false, reason: "revision-mismatch" };
  if (incoming.executionEpoch !== current.executionEpoch)
    return { accepted: false, reason: "execution-epoch-mismatch" };
  if (!active) return { accepted: false, reason: "execution-not-active" };
  if (active.identity.executionId !== incoming.executionId)
    return { accepted: false, reason: "execution-id-mismatch" };
  if (active.identity.attempt !== incoming.attempt)
    return { accepted: false, reason: "attempt-mismatch" };
  if (active.identity.source !== incoming.source || active.identity.operation !== incoming.operation)
    return { accepted: false, reason: "operation-mismatch" };
  return { accepted: true };
}
