import "server-only";

import type { RetrievalPrincipalScope } from "./contracts";
import type { RetrievalAccessPolicy } from "./ports/retrieval-access-policy";
import type { RetrievalDiagnosticsStore } from "./ports/retrieval-diagnostics-store";
import type { RetrievalIndex } from "./ports/retrieval-index";

export type RetrievalOutcomeReasonCode =
  | "retrieval-disabled"
  | "retrieval-dependency-unavailable"
  | "retrieval-principal-unavailable"
  | "retrieval-access-denied"
  | "retrieval-failed"
  | "retrieval-no-evidence"
  | "retrieval-budget-omitted"
  | "retrieval-succeeded";

export interface DocumentRetrievalRuntime {
  readonly enabled: boolean;
  readonly principal?: RetrievalPrincipalScope;
  readonly index?: RetrievalIndex;
  readonly accessPolicy?: RetrievalAccessPolicy;
  readonly diagnosticsStore?: RetrievalDiagnosticsStore;
}

export function getDocumentRetrievalRuntime(): DocumentRetrievalRuntime | undefined {
  return undefined;
}
