import { beforeEach, describe, expect, it, vi } from "vitest";

const { serverKernel, serverClock, serverIds } = vi.hoisted(() => ({
  serverKernel: { list: vi.fn(), dispatch: vi.fn() },
  serverClock: { now: vi.fn(() => "2026-10-23T00:00:00.000Z") },
  serverIds: { investigationId: vi.fn(() => "investigation-created") },
}));

vi.mock("@/features/lattice-next/kernel/server/server-kernel-runtime", () => ({ serverKernel, serverClock, serverIds }));

import { GET, POST } from "./route";

describe("investigations collection route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists active investigations with the default bound", async () => {
    serverKernel.list.mockResolvedValue([{ investigationId: "investigation-1" }]);

    const response = await GET(new Request("http://localhost/api/lattice/investigations"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([{ investigationId: "investigation-1" }]);
    expect(serverKernel.list).toHaveBeenCalledWith({ includeArchived: false, limit: 20 });
  });

  it("includes archived items and clamps the requested limit", async () => {
    serverKernel.list.mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/lattice/investigations?includeArchived=true&limit=500"));

    expect(response.status).toBe(200);
    expect(serverKernel.list).toHaveBeenCalledWith({ includeArchived: true, limit: 100 });
  });

  it("rejects malformed list limits", async () => {
    const response = await GET(new Request("http://localhost/api/lattice/investigations?limit=recent"));

    expect(response.status).toBe(400);
    expect(serverKernel.list).not.toHaveBeenCalled();
  });

  it("retains investigation creation behavior", async () => {
    serverKernel.dispatch.mockResolvedValue({ identity: { investigationId: "investigation-created" } });
    const response = await POST(new Request("http://localhost/api/lattice/investigations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectLabel: "Steering",
        query: "Steering",
        selections: [{ source: "windchill", nativeId: "wc-1", displayName: "Steering" }],
      }),
    }));

    expect(response.status).toBe(201);
    expect(serverKernel.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "create", subjectLabel: "Steering" }));
  });
});