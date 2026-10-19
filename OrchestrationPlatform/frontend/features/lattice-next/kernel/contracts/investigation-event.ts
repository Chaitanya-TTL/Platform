import type { InvestigationIdentity, InvestigationId, ExecutionIdentity } from "./investigation-identity";
import type { SourceOperationResult } from "./source-operation-result";
import type { SourceSelection } from "./source-operation";

export interface EventMetadata {
  eventId: string;
  sequence: number;
  occurredAt: string;
}

export type InvestigationEvent =
  | (EventMetadata & {
      type: "investigation-created";
      identity: InvestigationIdentity;
      subjectLabel: string;
      query: string;
      selections: readonly SourceSelection[];
    })
  | (EventMetadata & { type: "investigation-begun"; investigationId: InvestigationId })
  | (EventMetadata & { type: "source-operation-requested"; identity: ExecutionIdentity })
  | (EventMetadata & { type: "source-operation-started"; identity: ExecutionIdentity })
  | (EventMetadata & { type: "source-operation-completed"; result: SourceOperationResult })
  | (EventMetadata & { type: "canonical-assembly-requested"; investigationId: InvestigationId })
  | (EventMetadata & {
      type: "canonical-published";
      investigationId: InvestigationId;
      revision: number;
      canonical: unknown;
    })
  | (EventMetadata & {
      type: "investigation-refreshed";
      identity: InvestigationIdentity;
    })
  | (EventMetadata & { type: "investigation-cancelled"; investigationId: InvestigationId })
  | (EventMetadata & {
      type: "investigation-failed";
      investigationId: InvestigationId;
      code: string;
      message: string;
    })
  | (EventMetadata & {
      type: "stale-result-rejected";
      investigationId: InvestigationId;
      identity: ExecutionIdentity;
      reason: string;
    });
