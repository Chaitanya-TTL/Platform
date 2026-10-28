import { beforeEach, describe, expect, it, vi } from "vitest";

const { serverKernel } = vi.hoisted(() => ({ serverKernel: { dispatch: vi.fn(), load: vi.fn() } }));

vi.mock("@/features/lattice-next/kernel/server/server-kernel-runtime", () => ({ serverKernel }));

import { GET, POST } from "./route";

describe("investigation item route archive commands", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reopens the saved snapshot without dispatching work", async () => {
    const snapshot = { identity: { investigationId: "investigation-1", revision: 4 }, lifecycle: "ready" };
    serverKernel.load.mockResolvedValue(snapshot);

    const response = await GET(new Request("http://localhost/api/lattice/investigations/investigation-1"), {
      params: Promise.resolve({ investigationId: "investigation-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(snapshot);
    expect(serverKernel.load).toHaveBeenCalledWith("investigation-1");
    expect(serverKernel.dispatch).not.toHaveBeenCalled();
  });

  it("dispatches an archive command only for its route investigation", async () => {
    serverKernel.dispatch.mockResolvedValue({ archivedAt: "2026-10-23T00:00:00.000Z" });
    const response = await POST(new Request("http://localhost/api/lattice/investigations/investigation-1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: {
        type: "archive",
        investigationId: "investigation-1",
        occurredAt: "2026-10-23T00:00:00.000Z",
      } }),
    }), { params: Promise.resolve({ investigationId: "investigation-1" }) });

    expect(response.status).toBe(200);
    expect(serverKernel.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "archive" }));
  });

  it("rejects an archive command for a different investigation", async () => {
    const response = await POST(new Request("http://localhost/api/lattice/investigations/investigation-1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: {
        type: "archive",
        investigationId: "investigation-2",
        occurredAt: "2026-10-23T00:00:00.000Z",
      } }),
    }), { params: Promise.resolve({ investigationId: "investigation-1" }) });

    expect(response.status).toBe(409);
    expect(serverKernel.dispatch).not.toHaveBeenCalled();
  });
});