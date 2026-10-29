import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { FileCopilotConversationStore } from "../../kernel/server/file-copilot-conversation-store";
import { asInvestigationId } from "../../kernel/contracts/investigation-identity";
import { CopilotKitConversationRunner, toCopilotKitThreadId } from "../copilotkit-agent-runner";
import type { BaseEvent } from "@ag-ui/client";

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "lattice-copilotkit-runner-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const answer = {
  answer: "The selected source record is available.",
  claims: [{ text: "The record is available.", kind: "fact" as const, citationIds: ["cite:entity:part%3A1"] }],
  recommendations: [],
  uncertainties: [],
  followUpQuestions: [],
  snapshotRevision: 3,
  citations: [{ citationId: "cite:entity:part%3A1", kind: "entity" as const, label: "Part 1" }],
};

async function collect(events$: { subscribe(observer: { next(event: BaseEvent): void; error(error: unknown): void; complete(): void }): { unsubscribe(): void } }): Promise<BaseEvent[]> {
  const events: BaseEvent[] = [];
  await new Promise<void>((resolve, reject) => {
    events$.subscribe({ next: (event) => events.push(event), error: reject, complete: resolve });
  });
  return events;
}

describe("CopilotKit conversation runner", () => {
  it("restores only the requested investigation thread after runtime memory is empty", async () => {
    const root = await temporaryRoot();
    const store = new FileCopilotConversationStore(root);
    const investigationId = asInvestigationId("investigation-one");
    const otherInvestigationId = asInvestigationId("investigation-two");
    await store.createThread(investigationId, "shared-thread", "Selected thread");
    await store.appendUserMessage(investigationId, "shared-thread", 0, "Explain this record", 3, undefined, "user-turn-1");
    await store.appendTurn(investigationId, "shared-thread", 1, "Explain this record", {
      answer,
      at: "2026-10-26T00:00:00.000Z",
      snapshotRevision: 3,
      idempotencyKey: "user-turn-1",
    });
    await store.createThread(otherInvestigationId, "shared-thread", "Other investigation");
    await store.appendUserMessage(otherInvestigationId, "shared-thread", 0, "Private question", 9, undefined, "user-turn-2");

    const runner = new CopilotKitConversationRunner(store);
    const events = await collect(runner.connect({ threadId: toCopilotKitThreadId(investigationId, "shared-thread") }));
    const snapshot = events.find((event) => event.type === "MESSAGES_SNAPSHOT");

    expect(snapshot).toMatchObject({
      type: "MESSAGES_SNAPSHOT",
      messages: [
        { role: "user", content: "Explain this record" },
        { role: "assistant", content: answer.answer, metadata: { latticeAnswer: answer } },
      ],
    });
  });

  it("does not restore a thread identifier from another investigation", async () => {
    const root = await temporaryRoot();
    const store = new FileCopilotConversationStore(root);
    const investigationId = asInvestigationId("investigation-one");
    const otherInvestigationId = asInvestigationId("investigation-two");
    await store.createThread(otherInvestigationId, "foreign-thread", "Foreign");
    await store.appendUserMessage(otherInvestigationId, "foreign-thread", 0, "Private", 9);

    const runner = new CopilotKitConversationRunner(store);
    const events = await collect(runner.connect({ threadId: toCopilotKitThreadId(investigationId, "foreign-thread") }));

    expect(events).toEqual([]);
  });

  it("ignores malformed composite thread identifiers without loading storage", async () => {
    const store = {
      listThreads: vi.fn(),
      loadThread: vi.fn(),
      createThread: vi.fn(),
      appendUserMessage: vi.fn(),
      appendTurn: vi.fn(),
    };
    const runner = new CopilotKitConversationRunner(store);

    const events = await Promise.all([
      collect(runner.connect({ threadId: "bad investigation--thread-1" })),
      collect(runner.connect({ threadId: "investigation-one--bad/thread" })),
      collect(runner.connect({ threadId: "--thread-1" })),
    ]);

    expect(events).toEqual([[], [], []]);
    expect(store.listThreads).not.toHaveBeenCalled();
    expect(store.loadThread).not.toHaveBeenCalled();
    expect(store.createThread).not.toHaveBeenCalled();
    expect(store.appendUserMessage).not.toHaveBeenCalled();
    expect(store.appendTurn).not.toHaveBeenCalled();
  });

  it("starts a fresh valid client thread with an empty restored message snapshot", async () => {
    const store = {
      listThreads: vi.fn(),
      loadThread: vi.fn().mockResolvedValue(undefined),
      createThread: vi.fn(),
      appendUserMessage: vi.fn(),
      appendTurn: vi.fn(),
    };
    const runner = new CopilotKitConversationRunner(store);

    const events = await collect(runner.connect({
      threadId: toCopilotKitThreadId("investigation-one", "new-thread-1"),
    }));

    expect(events).toEqual([]);
    expect(store.loadThread).toHaveBeenCalledWith("investigation-one", "new-thread-1");
  });
});
