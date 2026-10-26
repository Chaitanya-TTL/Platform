import { NextResponse } from "next/server";
import type { InvestigationId } from "../../../../../../features/lattice-next/kernel/contracts/investigation-identity";
import { serverKernel } from "@/features/lattice-next/kernel/server/server-kernel-runtime";
import { FileCopilotConversationStore } from "@/features/lattice-next/kernel/server/file-copilot-conversation-store";
import { executeCopilotTurn } from "@/features/lattice-next/copilot/execute-copilot-turn";

export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 32_000;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_THREAD_LIST = 50;
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

export async function GET(request: Request, context: Context) {
  const { investigationId: rawId } = await context.params;
  const investigationId = rawId as InvestigationId;
  const snapshot = await serverKernel.load(investigationId);
  if (!snapshot) return jsonError("Investigation was not found.", 404);

  const threadId = new URL(request.url).searchParams.get("threadId");
  if (threadId) {
    const thread = await store.loadThread(investigationId, threadId);
    return thread
      ? NextResponse.json({ investigationId, thread })
      : jsonError("Copilot thread was not found.", 404);
  }

  const threads = await store.listThreads(investigationId, MAX_THREAD_LIST);
  const latestThread = threads.length ? await store.loadThread(investigationId, threads[0].threadId) : undefined;
  return NextResponse.json({ investigationId, threads, latestThread });
}

export async function POST(request: Request, context: Context) {
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
  if (typeof body.message !== "string" || !body.message.trim() || body.message.length > MAX_MESSAGE_CHARS)
    return jsonError(`message must be between 1 and ${MAX_MESSAGE_CHARS} characters.`, 400);
  const message = body.message.trim();
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

  try {
    const outcome = await executeCopilotTurn({
      investigationId,
      expectedSnapshotRevision: Number(body.expectedSnapshotRevision),
      idempotencyKey,
      message,
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
