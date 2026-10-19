import type { InvestigationCommand } from "../contracts/investigation-command";
import type { InvestigationEvent } from "../contracts/investigation-event";
import type { InvestigationSnapshot } from "../contracts/investigation-snapshot";
import type { InvestigationIdProvider } from "../ports/kernel-services";
import { assessExecutionResult, executionKey } from "./stale-result-guard";

export class InvestigationCommandHandler {
  constructor(private readonly ids: InvestigationIdProvider) {}

  handle(
    command: InvestigationCommand,
    snapshot: InvestigationSnapshot | undefined,
    nextSequence: number,
  ): readonly InvestigationEvent[] {
    const metadata = () => ({
      eventId: this.ids.eventId(),
      sequence: nextSequence,
      occurredAt: command.occurredAt,
    });
    switch (command.type) {
      case "create":
        if (snapshot) throw new Error("Investigation already exists.");
        return [{
          ...metadata(),
          type: "investigation-created",
          identity: {
            investigationId: command.investigationId,
            revision: 1,
            executionEpoch: 1,
          },
          subjectLabel: command.subjectLabel,
          query: command.query,
          selections: command.selections,
        }];
      case "begin":
        return [{ ...metadata(), type: "investigation-begun", investigationId: command.investigationId }];
      case "source-requested":
        return [{ ...metadata(), type: "source-operation-requested", identity: command.identity }];
      case "source-started":
        return [{ ...metadata(), type: "source-operation-started", identity: command.identity }];
      case "source-completed": {
        if (!snapshot) throw new Error("Investigation does not exist.");
        const active = snapshot.executions[executionKey(command.result.identity)];
        const decision = assessExecutionResult(snapshot.identity, active, command.result.identity);
        return decision.accepted
          ? [{ ...metadata(), type: "source-operation-completed", result: command.result }]
          : [{
              ...metadata(),
              type: "stale-result-rejected",
              investigationId: snapshot.identity.investigationId,
              identity: command.result.identity,
              reason: decision.reason ?? "stale-result",
            }];
      }
      case "request-assembly":
        return [{ ...metadata(), type: "canonical-assembly-requested", investigationId: command.investigationId }];
      case "publish-canonical":
        return [{
          ...metadata(),
          type: "canonical-published",
          investigationId: command.investigationId,
          revision: command.revision,
          canonical: command.canonical,
        }];
      case "refresh":
        if (!snapshot) throw new Error("Investigation does not exist.");
        return [{
          ...metadata(),
          type: "investigation-refreshed",
          identity: {
            investigationId: snapshot.identity.investigationId,
            revision: snapshot.identity.revision + 1,
            executionEpoch: snapshot.identity.executionEpoch + 1,
          },
        }];
      case "cancel":
        return [{ ...metadata(), type: "investigation-cancelled", investigationId: command.investigationId }];
      case "fail":
        return [{
          ...metadata(),
          type: "investigation-failed",
          investigationId: command.investigationId,
          code: command.code,
          message: command.message,
        }];
    }
  }
}
