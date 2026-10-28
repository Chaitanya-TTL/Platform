import { beforeEach, describe, expect, it, vi } from "vitest";

const { serverKernel } = vi.hoisted(() => ({ serverKernel: { load: vi.fn(), dispatch: vi.fn() } }));

vi.mock("@/features/lattice-next/kernel/server/server-kernel-runtime", () => ({ serverKernel }));

import { POST } from "./route";

const context = { params: Promise.resolve({ investigationId: "investigation-1" }) };
const request = (body: unknown) => new Request("http://localhost/api/lattice/investigations/investigation-1/refresh", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("explicit investigation refresh route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts a refresh from the persisted investigation after matching its revision", async () => {
    const snapshot = {
      identity: { investigationId: "investigation-1", revision: 4 },
      selections: [{ source: "windchill", nativeId: "persisted-id", displayName: "Persisted selection" }],
      executions: {},
      lifecycle: "ready",
      subjectLabel: "Persisted subject",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    serverKernel.load.mockResolvedValue(snapshot);
    serverKernel.dispatch.mockResolvedValue({ ...snapshot, identity: { ...snapshot.identity, revision: 5 }, lifecycle: "refreshing" });

    const response = await POST(request({ expectedRevision: 4 }), context);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ previousRevision: 4, revision: 5, lifecycle: "refreshing" });
    expect(serverKernel.dispatch).toHaveBeenCalledWith({
      type: "refresh",
      investigationId: "investigation-1",
      expectedRevision: 4,
      occurredAt: expect.any(String),
    });
  });

  it("rejects stale revisions without dispatching", async () => {
    serverKernel.load.mockResolvedValue({ identity: { investigationId: "investigation-1", revision: 5 }, lifecycle: "ready" });

    const response = await POST(request({ expectedRevision: 4 }), context);

    expect(response.status).toBe(409);
    expect(serverKernel.dispatch).not.toHaveBeenCalled();
  });

  it("rejects archived investigations and client-supplied replacement selections", async () => {
    serverKernel.load.mockResolvedValue({ identity: { investigationId: "investigation-1", revision: 4 }, lifecycle: "ready", archivedAt: "2026-01-01T00:00:00.000Z" });
    const archivedResponse = await POST(request({ expectedRevision: 4 }), context);
    expect(archivedResponse.status).toBe(409);

    serverKernel.load.mockResolvedValue({ identity: { investigationId: "investigation-1", revision: 4 }, lifecycle: "ready" });
    const selectionsResponse = await POST(request({ expectedRevision: 4, selections: [{ source: "sap", nativeId: "untrusted" }] }), context);
    expect(selectionsResponse.status).toBe(400);
    expect(serverKernel.dispatch).not.toHaveBeenCalled();
  });
});