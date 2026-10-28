import { afterEach, describe, expect, it, vi } from "vitest";
import { getCopilotThreads, postCopilotMessage } from "../copilot/client";

afterEach(() => vi.unstubAllGlobals());

describe("copilot browser client", () => {
  it("loads thread metadata without sending a model request", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, _init) => new Response(JSON.stringify({ investigationId: "inv 1", threads: [], latestThread: undefined }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getCopilotThreads("inv 1")).resolves.toMatchObject({ investigationId: "inv 1", threads: [] });
    expect(fetchMock).toHaveBeenCalledWith("/api/lattice/investigations/inv%201/copilot", { cache: "no-store" });
  });

  it("posts only on explicit send with snapshot revision and idempotency key", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, _init) => new Response(JSON.stringify({
      investigationId: "inv-1",
      threadId: "thread-1",
      threadRevision: 2,
      snapshotRevision: 7,
      answer: { answer: "Grounded", claims: [], recommendations: [], uncertainties: [], followUpQuestions: [], snapshotRevision: 7 },
      idempotentReplay: false,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await postCopilotMessage({ investigationId: "inv-1", threadId: "thread-1", expectedThreadRevision: 1, expectedSnapshotRevision: 7, idempotencyKey: "question-1", message: "Explain" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/lattice/investigations/inv-1/copilot");
    expect(JSON.parse(String(init?.body))).toEqual({ threadId: "thread-1", expectedThreadRevision: 1, expectedSnapshotRevision: 7, idempotencyKey: "question-1", message: "Explain" });
  });

  it("preserves safe validation details and billing status from failed responses", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      message: "Copilot returned an answer that could not be validated.",
      validationIssue: "claims[0].citationIds contains an unknown citation ID.",
      requestMayHaveBeenBilled: true,
      retryable: true,
    }), { status: 502 })));

    await expect(postCopilotMessage({ investigationId: "inv-1", expectedSnapshotRevision: 7, idempotencyKey: "question-1", message: "Explain" }))
      .rejects.toMatchObject({
        validationIssue: "claims[0].citationIds contains an unknown citation ID.",
        requestMayHaveBeenBilled: true,
        retryable: true,
      });
  });
});
