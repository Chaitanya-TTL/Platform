import { NextResponse } from "next/server";
import type { InvestigationId } from "../../../../../../features/lattice-next/kernel/contracts/investigation-identity";
import { serverKernel } from "@/features/lattice-next/kernel/server/server-kernel-runtime";
import { FileCopilotConversationStore } from "@/features/lattice-next/kernel/server/file-copilot-conversation-store";
import { executeCopilotTurn } from "@/features/lattice-next/copilot/execute-copilot-turn";
import {
  createCopilotTraceContext,
  toCopilotTraceJsonValue,
  writeCopilotTraceStage,
  type CopilotTraceContext,
  type CopilotTraceJsonValue,
} from "@/features/lattice-next/copilot/copilot-execution-trace";

export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 32_000;
const store = new FileCopilotConversationStore();

type Context = { params: Promise<{ investigationId: string }> };
type CopilotPostBody = {
  threadId?: unknown;
  expectedThreadRevision?: unknown;
  expectedSnapshotRevision?: unknown;
  idempotencyKey?: unknown;
  message?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function clientThread(thread: Awaited<ReturnType<typeof store.loadThread>>) {
  if (!thread) return undefined;
  const visibleThread = { ...thread };
  delete visibleThread.conversationState;
  return visibleThread;
}

export async function GET(request: Request, context: Context) {
  const { investigationId: rawId } = await context.params;
  const investigationId = rawId as InvestigationId;
  const snapshot = await serverKernel.load(investigationId);
  if (!snapshot) return jsonError("Investigation was not found.", 404);

  const threadId = new URL(request.url).searchParams.get("threadId");
  if (threadId) {
    const thread = await store.loadThread(investigationId, threadId);
    return thread
      ? NextResponse.json({ investigationId, thread: clientThread(thread) })
      : jsonError("Copilot thread was not found.", 404);
  }

  const threads = await store.listThreads(investigationId);
  const latestThread = threads.length ? await store.loadThread(investigationId, threads[0].threadId) : undefined;
  return NextResponse.json({ investigationId, threads, latestThread: clientThread(latestThread) });
}

async function handlePost(request: Request, context: Context, traceContext: CopilotTraceContext) {
  const { investigationId: rawId } = await context.params;
  const investigationId = rawId as InvestigationId;
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES)
    return jsonError("Copilot request exceeds the maximum allowed size.", 413);

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonError("Copilot request body could not be read.", 400);
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES)
    return jsonError("Copilot request exceeds the maximum allowed size.", 413);

  let body: CopilotPostBody;
  try {
    body = JSON.parse(rawBody) as CopilotPostBody;
  } catch {
    return jsonError("A valid JSON copilot request is required.", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => !["threadId", "expectedThreadRevision", "expectedSnapshotRevision", "idempotencyKey", "message"].includes(key)))
    return jsonError("Copilot request contains unsupported fields.", 400);
  if (typeof body.message !== "string" || !body.message.trim())
    return jsonError("message must be a non-empty string.", 400);
  const message = body.message;
  if (typeof body.idempotencyKey !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(body.idempotencyKey))
    return jsonError("idempotencyKey is required and must be a safe request identifier.", 400);
  const idempotencyKey = body.idempotencyKey;
  if (!Number.isSafeInteger(body.expectedSnapshotRevision) || Number(body.expectedSnapshotRevision) < 1)
    return jsonError("expectedSnapshotRevision must be a positive integer.", 400);
  if (body.threadId !== undefined && (typeof body.threadId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(body.threadId)))
    return jsonError("threadId is invalid.", 400);
  if (body.threadId !== undefined && (!Number.isSafeInteger(body.expectedThreadRevision) || Number(body.expectedThreadRevision) < 0))
    return jsonError("expectedThreadRevision is required for an existing thread.", 400);
  if (body.threadId === undefined && body.expectedThreadRevision !== undefined)
    return jsonError("expectedThreadRevision is only accepted with threadId.", 400);

  writeCopilotTraceStage(traceContext, {
    event: "request.validated",
    stage: "send.validation",
    investigationId: String(investigationId),
    snapshotRevision: Number(body.expectedSnapshotRevision),
    input: { messageCharacters: message.length, hasThreadId: typeof body.threadId === "string" },
    ...(traceContext.payloadDetail === "full" ? { fullPayload: { question: message } } : {}),
  });

  try {
    const outcome = await executeCopilotTurn({
      investigationId,
      expectedSnapshotRevision: Number(body.expectedSnapshotRevision),
      idempotencyKey,
      message,
      traceContext,
      ...(typeof body.threadId === "string" ? { threadId: body.threadId } : {}),
      ...(Number.isSafeInteger(body.expectedThreadRevision) ? { expectedThreadRevision: Number(body.expectedThreadRevision) } : {}),
    });
    return outcome.ok
      ? NextResponse.json(outcome)
      : NextResponse.json(outcome.body, { status: outcome.status });
  } catch {
    return jsonError("Copilot request could not be completed.", 500);
  }
}

export async function POST(request: Request, context: Context) {
  const traceContext = createCopilotTraceContext(request);
  const startedAt = Date.now();
  writeCopilotTraceStage(traceContext, {
    event: "request.received",
    stage: "send",
    input: {
      method: "POST",
      contentLength: request.headers.get("content-length"),
    },
  });

  try {
    const response = await handlePost(request, context, traceContext);
    let responseSummary: { contentType: string | null; bodyCharacters?: number } = {
      contentType: response.headers.get("content-type"),
    };
    let fullPayload: CopilotTraceJsonValue | undefined;
    try {
      const body = await response.clone().json();
      const serializedBody = JSON.stringify(body);
      responseSummary = { ...responseSummary, bodyCharacters: serializedBody.length };
      fullPayload = toCopilotTraceJsonValue(body);
    } catch {
      responseSummary = { ...responseSummary, bodyCharacters: 0 };
    }
    writeCopilotTraceStage(traceContext, {
      event: "response.returned",
      stage: "send.response",
      durationMs: Date.now() - startedAt,
      outcome: response.ok ? "success" : "http-error",
      output: { status: response.status, ...responseSummary },
      ...(traceContext.payloadDetail === "full" && fullPayload !== undefined
        ? { fullPayload: { response: fullPayload } }
        : {}),
    });
    return response;
  } catch (error) {
    writeCopilotTraceStage(traceContext, {
      event: "request.failed",
      stage: "send",
      durationMs: Date.now() - startedAt,
      outcome: "failed",
      diagnostics: { errorType: error instanceof Error ? error.name : "UnknownError" },
    });
    throw error;
  }
}
