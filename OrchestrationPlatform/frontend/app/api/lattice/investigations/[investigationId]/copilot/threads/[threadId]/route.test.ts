import { beforeEach, describe, expect, it, vi } from "vitest";

const { serverKernel, conversationStore } = vi.hoisted(() => ({
  serverKernel: { load: vi.fn() },
  conversationStore: { loadThread: vi.fn() },
}));

vi.mock("@/features/lattice-next/kernel/server/server-kernel-runtime", () => ({ serverKernel }));
vi.mock("@/features/lattice-next/kernel/server/file-copilot-conversation-store", () => ({ FileCopilotConversationStore: class { constructor() { return conversationStore; } } }));

import { GET } from "./route";

const context = { params: Promise.resolve({ investigationId: "investigation-1", threadId: "thread-1" }) };

describe("copilot thread read route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverKernel.load.mockResolvedValue({ identity: { investigationId: "investigation-1" }, archivedAt: "2026-10-22T00:00:00.000Z" });
    conversationStore.loadThread.mockResolvedValue({ investigationId: "investigation-1", threadId: "thread-1", messages: [] });
  });

  it("keeps archived investigation threads readable and scopes lookup to the URL investigation", async () => {
    const response = await GET(new Request("http://localhost/api/lattice/investigations/investigation-1/copilot/threads/thread-1"), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ investigationId: "investigation-1", thread: { threadId: "thread-1" } });
    expect(conversationStore.loadThread).toHaveBeenCalledWith("investigation-1", "thread-1");
  });

  it("returns not found when a thread is outside the investigation", async () => {
    conversationStore.loadThread.mockResolvedValue(undefined);
    const response = await GET(new Request("http://localhost/api/lattice/investigations/investigation-1/copilot/threads/thread-foreign"), context);
    expect(response.status).toBe(404);
  });
});
