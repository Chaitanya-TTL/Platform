import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  serverKernel: { load: vi.fn() },
  conversationStore: { listThreads: vi.fn(), loadThread: vi.fn() },
  executeCopilotTurn: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/lattice-next/kernel/server/server-kernel-runtime", () => ({ serverKernel: mocks.serverKernel }));
vi.mock("@/features/lattice-next/kernel/server/file-copilot-conversation-store", () => ({ FileCopilotConversationStore: class { constructor() { return mocks.conversationStore; } } }));
vi.mock("@/features/lattice-next/copilot/execute-copilot-turn", () => ({ executeCopilotTurn: mocks.executeCopilotTurn }));

import { GET, POST } from "./route";

const routeContext = { params: Promise.resolve({ investigationId: "investigation-1" }) };
const investigationId = "investigation-1";
const threadId = "thread-1";
const idempotencyKey = "request-unique-001";
const savedSnapshot = {};
const userMessage = "What is this item?";
const post = (body: unknown) => new Request(`http://localhost/api/lattice/investigations/${investigationId}/copilot`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("investigation copilot orchestration route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("LATTICE_COPILOT_DIAGNOSTICS_ENABLED", "false");
    mocks.serverKernel.load.mockResolvedValue(savedSnapshot);
    mocks.conversationStore.listThreads.mockResolvedValue([]);
    mocks.conversationStore.loadThread.mockResolvedValue(undefined);
    mocks.executeCopilotTurn.mockResolvedValue({
      ok: true,
      investigationId,
      threadId,
      threadRevision: 1,
      snapshotRevision: 4,
      answer: { answer: "This is Part 1001." },
      idempotentReplay: false,
    });
  });

  it("lists threads and restores a selected thread without model calls", async () => {
    mocks.conversationStore.listThreads.mockResolvedValue([{ threadId, updatedAt: "2026-10-23T00:00:00.000Z" }]);
    const response = await GET(new Request(`http://localhost/api/lattice/investigations/${investigationId}/copilot`), routeContext);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ investigationId, threads: [{ threadId }] });

    mocks.conversationStore.loadThread.mockResolvedValue({ investigationId, threadId, messages: [] });
    const threadResponse = await GET(new Request(`http://localhost/api/lattice/investigations/${investigationId}/copilot?threadId=${threadId}`), routeContext);
    expect(threadResponse.status).toBe(200);
    expect(mocks.executeCopilotTurn).not.toHaveBeenCalled();
  });

  it("validates requests and delegates long question content without trimming", async () => {
    expect((await POST(post({ expectedSnapshotRevision: 4, message: userMessage }), routeContext)).status).toBe(400);
    const longQuestion = ` ${"x".repeat(10_001)} `;
    const response = await POST(post({
      expectedSnapshotRevision: 4,
      message: longQuestion,
      idempotencyKey,
      threadId,
      expectedThreadRevision: 3,
    }), routeContext);
    expect(response.status).toBe(200);
    expect(mocks.executeCopilotTurn).toHaveBeenCalledWith(expect.objectContaining({
      investigationId,
      expectedSnapshotRevision: 4,
      idempotencyKey,
      message: longQuestion,
      threadId,
      expectedThreadRevision: 3,
      traceContext: expect.objectContaining({
        requestId: expect.any(String),
        routeSource: "Unknown",
        payloadDetail: "summary",
      }),
    }));

  });

  it("passes a request-scoped full-payload opt-in only when non-production diagnostics allow it", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("LATTICE_COPILOT_DIAGNOSTICS_ENABLED", "true");
    vi.stubEnv("LATTICE_COPILOT_DIAGNOSTICS_FULL_PAYLOAD_TRACE", "true");
    const request = new Request(`http://localhost/api/lattice/investigations/${investigationId}/copilot`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Copilot-Diagnostic-Detail": "full",
      },
      body: JSON.stringify({
        expectedSnapshotRevision: 4,
        message: userMessage,
        idempotencyKey,
      }),
    });

    await POST(request, routeContext);

    expect(mocks.executeCopilotTurn).toHaveBeenCalledWith(expect.objectContaining({
      traceContext: expect.objectContaining({
        requestId: expect.any(String),
        traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
        traceparent: expect.stringMatching(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/),
        routeSource: "Unknown",
        payloadDetail: "full",
      }),
    }));
  });

  it("preserves execution failures and enforces the transport body bound", async () => {
    mocks.executeCopilotTurn.mockResolvedValue({ ok: false, status: 409, body: { message: "Snapshot revision changed." } });
    const failure = await POST(post({ expectedSnapshotRevision: 4, message: userMessage, idempotencyKey }), routeContext);
    expect(failure.status).toBe(409);
    await expect(failure.json()).resolves.toEqual({ message: "Snapshot revision changed." });

    const oversized = new Request(`http://localhost/api/lattice/investigations/${investigationId}/copilot`, { method: "POST", body: "x".repeat(40_000) });
    expect((await POST(oversized, routeContext)).status).toBe(413);
    expect(mocks.executeCopilotTurn).toHaveBeenCalledTimes(1);
  });
});
