import type { CopilotAnswer } from "./contracts";
import type { CopilotConversationThread, CopilotThreadSummary } from "../kernel/ports/copilot-conversation-store";

export class CopilotClientError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly failureCode?: string,
    readonly providerStatus?: number,
    readonly validationIssue?: string,
    readonly retryable?: boolean,
    readonly requestMayHaveBeenBilled?: boolean,
  ) {
    super(message);
    this.name = "CopilotClientError";
  }
}

export interface CopilotThreadsResponse {
  investigationId: string;
  threads: readonly CopilotThreadSummary[];
  latestThread?: CopilotConversationThread;
}

export interface CopilotPostResponse {
  investigationId: string;
  threadId: string;
  threadRevision: number;
  snapshotRevision: number;
  answer: CopilotAnswer;
  idempotentReplay: boolean;
}

async function read<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new CopilotClientError(
    response.status,
    body?.message ?? "Copilot request failed.",
    typeof body?.failureCode === "string" ? body.failureCode : undefined,
    typeof body?.providerStatus === "number" ? body.providerStatus : undefined,
    typeof body?.validationIssue === "string" ? body.validationIssue : undefined,
    typeof body?.retryable === "boolean" ? body.retryable : undefined,
    typeof body?.requestMayHaveBeenBilled === "boolean" ? body.requestMayHaveBeenBilled : undefined,
  );
  return body as T;
}

function route(investigationId: string): string {
  return `/api/lattice/investigations/${encodeURIComponent(investigationId)}/copilot`;
}

export async function getCopilotThreads(investigationId: string): Promise<CopilotThreadsResponse> {
  return read<CopilotThreadsResponse>(await fetch(route(investigationId), { cache: "no-store" }));
}

export async function getCopilotThread(investigationId: string, threadId: string): Promise<CopilotConversationThread> {
  const query = new URLSearchParams({ threadId });
  const result = await read<{ investigationId: string; thread: CopilotConversationThread }>(
    await fetch(`${route(investigationId)}?${query.toString()}`, { cache: "no-store" }),
  );
  return result.thread;
}

export async function postCopilotMessage(input: {
  investigationId: string;
  threadId?: string;
  expectedThreadRevision?: number;
  expectedSnapshotRevision: number;
  idempotencyKey: string;
  message: string;
}): Promise<CopilotPostResponse> {
  return read<CopilotPostResponse>(await fetch(route(input.investigationId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...(input.threadId ? { threadId: input.threadId, expectedThreadRevision: input.expectedThreadRevision } : {}),
      expectedSnapshotRevision: input.expectedSnapshotRevision,
      idempotencyKey: input.idempotencyKey,
      message: input.message,
    }),
    cache: "no-store",
  }));
}
