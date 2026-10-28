import type { InvestigationId, ExecutionIdentity } from "./investigation-identity";
import type { SourceOperationResult } from "./source-operation-result";
import type { SourceSelection } from "./source-operation";

export type InvestigationCommand =
  | {
      type: "create";
      investigationId: InvestigationId;
      subjectLabel: string;
      query: string;
      selections: readonly SourceSelection[];
      occurredAt: string;
    }
  | { type: "begin"; investigationId: InvestigationId; occurredAt: string }
  | { type: "source-requested"; identity: ExecutionIdentity; occurredAt: string }
  | { type: "source-started"; identity: ExecutionIdentity; occurredAt: string }
  | { type: "source-completed"; result: SourceOperationResult; occurredAt: string }
  | { type: "request-assembly"; investigationId: InvestigationId; occurredAt: string }
  | {
      type: "publish-canonical";
      investigationId: InvestigationId;
      revision: number;
      canonical: unknown;
      occurredAt: string;
    }
  | { type: "refresh"; investigationId: InvestigationId; expectedRevision: number; occurredAt: string }
  | { type: "archive"; investigationId: InvestigationId; occurredAt: string }
  | { type: "restore"; investigationId: InvestigationId; occurredAt: string }
  | { type: "cancel"; investigationId: InvestigationId; occurredAt: string }
  | {
      type: "fail";
      investigationId: InvestigationId;
      code: string;
      message: string;
      occurredAt: string;
    };
