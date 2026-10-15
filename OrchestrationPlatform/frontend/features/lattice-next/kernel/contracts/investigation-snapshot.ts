import type { CompletenessAssessment } from "./completeness-assessment";
import type { InvestigationIdentity, ExecutionIdentity } from "./investigation-identity";
import type { InvestigationLifecycle } from "./investigation-lifecycle";
import type { SourceOperationStatus, SourceSelection } from "./source-operation";

export interface SourceExecutionSnapshot {
  identity: ExecutionIdentity;
  status: SourceOperationStatus;
  startedAt?: string;
  completedAt?: string;
  warnings: readonly string[];
  errorCode?: string;
  errorMessage?: string;
}

export interface PublishedCanonicalSnapshot<TCanonical = unknown> {
  revision: number;
  publishedAt: string;
  value: TCanonical;
}

export interface InvestigationSnapshot<TCanonical = unknown> {
  identity: InvestigationIdentity;
  lifecycle: InvestigationLifecycle;
  subjectLabel: string;
  query: string;
  selections: readonly SourceSelection[];
  executions: Readonly<Record<string, SourceExecutionSnapshot>>;
  acceptedEvidenceIds: readonly string[];
  completeness: CompletenessAssessment;
  canonical?: PublishedCanonicalSnapshot<TCanonical>;
  warnings: readonly string[];
  createdAt: string;
  updatedAt: string;
}
