import {
  AgentRunner,
  InMemoryAgentRunner,
  type AgentRunnerConnectRequest,
  type AgentRunnerIsRunningRequest,
  type AgentRunnerRunRequest,
  type AgentRunnerStopRequest,
} from "@copilotkit/runtime/v2";
import { EventType, type BaseEvent, type Message } from "@ag-ui/client";
import { Observable } from "rxjs";
import type { CopilotConversationStore, CopilotConversationThread } from "../kernel/ports/copilot-conversation-store";
import type { InvestigationId } from "../kernel/contracts/investigation-identity";
import { FileCopilotConversationStore } from "../kernel/server/file-copilot-conversation-store";

const THREAD_SEPARATOR = "--";

export function toCopilotKitThreadId(investigationId: InvestigationId | string, threadId: string): string {
  return `${investigationId}${THREAD_SEPARATOR}${threadId}`;
}

export function storedThreadIdentity(runtimeThreadId: string): { investigationId: InvestigationId; threadId: string } | undefined {
  const separatorIndex = runtimeThreadId.indexOf(THREAD_SEPARATOR);
  if (separatorIndex < 1) return undefined;
  const investigationId = runtimeThreadId.slice(0, separatorIndex);
  const threadId = runtimeThreadId.slice(separatorIndex + THREAD_SEPARATOR.length);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(investigationId) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(threadId)) return undefined;
  return { investigationId: investigationId as InvestigationId, threadId };
}

function messagesFromThread(thread: CopilotConversationThread): Message[] {
  return thread.messages.map((message, index) => message.role === "user"
    ? {
        id: `user-${message.idempotencyKey ?? index}`,
        role: "user" as const,
        content: message.content,
      }
    : {
        id: `assistant-${message.idempotencyKey ?? index}`,
        role: "assistant" as const,
        content: message.answer.answer,
        metadata: { latticeAnswer: message.answer },
      });
}

export class CopilotKitConversationRunner extends AgentRunner {
  private readonly activeRunner = new InMemoryAgentRunner({ onConcurrentRun: "throw" });

  constructor(private readonly store: CopilotConversationStore = new FileCopilotConversationStore()) {
    super();
  }

  run(request: AgentRunnerRunRequest): Observable<BaseEvent> {
    return this.activeRunner.run(request);
  }

  connect(request: AgentRunnerConnectRequest): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      let cancelled = false;
      let activeSubscription: { unsubscribe(): void } | undefined;

      void this.restoreConnection(request).then((events) => {
        if (cancelled) return;
        if (events === undefined) {
          activeSubscription = this.activeRunner.connect(request).subscribe(subscriber);
          return;
        }
        for (const event of events) subscriber.next(event);
        subscriber.complete();
      }).catch((error: unknown) => subscriber.error(error));

      return () => {
        cancelled = true;
        activeSubscription?.unsubscribe();
      };
    });
  }

  isRunning(request: AgentRunnerIsRunningRequest): Promise<boolean> {
    return this.activeRunner.isRunning(request);
  }

  stop(request: AgentRunnerStopRequest): Promise<boolean | undefined> {
    return this.activeRunner.stop(request);
  }

  private async restoreConnection(request: AgentRunnerConnectRequest): Promise<BaseEvent[] | undefined> {
    if (await this.activeRunner.isRunning({ threadId: request.threadId }) || this.activeRunner.getThreadMessages(request.threadId).length)
      return undefined;

    const identity = storedThreadIdentity(request.threadId);
    if (!identity) return [];
    const thread = await this.store.loadThread(identity.investigationId, identity.threadId);
    if (!thread?.messages.length) return [];
    return [{ type: EventType.MESSAGES_SNAPSHOT, timestamp: Date.now(), messages: messagesFromThread(thread) }];
  }
}