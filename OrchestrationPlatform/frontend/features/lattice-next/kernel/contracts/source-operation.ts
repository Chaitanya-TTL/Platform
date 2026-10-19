import type { ExecutionIdentity } from "./investigation-identity";

export type SourceOperationStatus =
  | "requested"
  | "running"
  | "succeeded"
  | "partial"
  | "empty"
  | "failed"
  | "timed-out"
  | "cancelled"
  | "unavailable";

export interface SourceSelection {
  source: string;
  nativeId: string;
  displayName: string;
  metadata?: Readonly<Record<string, string>>;
}

export interface SourceOperationCommand {
  identity: ExecutionIdentity;
  selection: SourceSelection;
  signal: AbortSignal;
}

export interface SourceOperationError {
  code:
    | "authentication-failed"
    | "authorization-failed"
    | "connector-unavailable"
    | "not-found"
    | "ambiguous-identity"
    | "invalid-native-id"
    | "contract-invalid"
    | "source-timeout"
    | "source-cancelled"
    | "malformed-output"
    | "unknown";
  message: string;
  retryable: boolean;
  details?: Readonly<Record<string, string>>;
}
