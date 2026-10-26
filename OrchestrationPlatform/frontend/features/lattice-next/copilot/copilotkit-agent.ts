import { randomUUID } from "node:crypto";
import {
  AbstractAgent,
  EventType,
  type BaseEvent,
  type RunAgentInput,
} from "@ag-ui/client";
import { Observable } from "rxjs";
import type { CopilotAnswer } from "./contracts";
import type { InvestigationId } from "../kernel/contracts/investigation-identity";
import { storedThreadIdentity } from "./copilotkit-agent-runner";

export interface CopilotKitTurnInput {
  investigationId: InvestigationId;
  threadId: string;
  expectedSnapshotRevision: number;
  idempotencyKey: string;
  message: string;
}

export type CopilotKitTurnExecutor = (input: CopilotKitTurnInput, signal: AbortSignal) => Promise<CopilotAnswer>;

export class CopilotKitAgentError extends Error {
  constructor(
    message: string,
    readonly code = "LATTICE_COPILOT_ERROR",
    readonly retryable = false,
    readonly requestMayHaveBeenBilled = true,
    readonly validationIssue?: string,
  ) {
    super(message);
    this.name = "CopilotKitAgentError";
  }
}

export class LatticeCopilotAgent extends AbstractAgent {
  private executeTurn: CopilotKitTurnExecutor;

  constructor(executeTurn: CopilotKitTurnExecutor) {
    super({ agentId: "default", description: "Read-only Lattice investigation copilot" });
    this.executeTurn = executeTurn;
  }

  override clone(): LatticeCopilotAgent {
    const copy = super.clone() as LatticeCopilotAgent;
    copy.executeTurn = this.executeTurn;
    return copy;
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      const controller = new AbortController();
      const runtimeThreadId = input.threadId;
      const identity = storedThreadIdentity(runtimeThreadId);
      const threadId = identity?.threadId;
      const userMessage = [...input.messages].reverse().find((message) => message.role === "user");
      const message = userMessage && typeof userMessage.content === "string" ? userMessage.content.trim() : "";
      const props = input.forwardedProps && typeof input.forwardedProps === "object"
        ? input.forwardedProps as Record<string, unknown>
        : {};
      const expectedSnapshotRevision = props.snapshotRevision;

      if (!threadId || !userMessage || !message || !Number.isSafeInteger(expectedSnapshotRevision) || Number(expectedSnapshotRevision) < 1) {
        subscriber.error(new Error("Copilot request is missing a valid thread, message, or snapshot revision."));
        return () => controller.abort();
      }

      subscriber.next({ type: EventType.RUN_STARTED, threadId: runtimeThreadId, runId: input.runId });
      const messageId = randomUUID();
      void this.executeTurn({
        investigationId: identity!.investigationId,
        threadId,
        expectedSnapshotRevision: Number(expectedSnapshotRevision),
        idempotencyKey: userMessage.id,
        message,
      }, controller.signal).then((answer) => {
        if (controller.signal.aborted || subscriber.closed) return;
        subscriber.next({
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: "assistant",
          metadata: { latticeAnswer: answer },
        });
        subscriber.next({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: answer.answer });
        subscriber.next({ type: EventType.TEXT_MESSAGE_END, messageId });
        subscriber.next({ type: EventType.RUN_FINISHED, threadId: runtimeThreadId, runId: input.runId });
        subscriber.complete();
      }).catch((cause: unknown) => {
        if (controller.signal.aborted || subscriber.closed) return;
        const error = cause instanceof CopilotKitAgentError
          ? cause
          : new CopilotKitAgentError(
              "Copilot could not complete a validated answer. Check the conversation state before retrying.",
              "LATTICE_COPILOT_ERROR",
              false,
              true,
            );
        subscriber.next({
          type: EventType.RUN_ERROR,
          threadId: runtimeThreadId,
          runId: input.runId,
          message: error.message,
          code: error.code,
          metadata: {
            retryable: error.retryable,
            requestMayHaveBeenBilled: error.requestMayHaveBeenBilled,
            ...(error.validationIssue ? { validationIssue: error.validationIssue } : {}),
          },
        });
        subscriber.complete();
      });

      return () => controller.abort();
    });
  }
}