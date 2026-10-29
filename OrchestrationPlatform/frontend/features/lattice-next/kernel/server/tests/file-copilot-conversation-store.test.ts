import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { FileCopilotConversationStore } from "../file-copilot-conversation-store";
import { asInvestigationId } from "../../contracts/investigation-identity";
import type { CopilotAnswer } from "../../../copilot/contracts";

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "lattice-copilot-threads-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const answer: CopilotAnswer = {
  answer: "The value is grounded in the selected snapshot.",
  claims: [{ text: "The item exists.", kind: "fact", citationIds: ["cite:entity:entity%3A1"] }],
  recommendations: [],
  uncertainties: [],
  followUpQuestions: [],
  snapshotRevision: 4,
  citations: [{ citationId: "cite:entity:entity%3A1", kind: "entity", label: "Synthetic item", nativeId: "NATIVE-1" }],
};
const firstInvestigation = asInvestigationId("investigation-one");
const secondInvestigation = asInvestigationId("investigation-two");

describe("file copilot conversation store", () => {
  it("isolates threads by investigation and lists latest threads first", async () => {
    const store = new FileCopilotConversationStore(await temporaryRoot());
    await store.createThread(firstInvestigation, "thread-a", "First thread");
    await store.appendUserMessage(firstInvestigation, "thread-a", 0, "Question A", 4);
    await store.createThread(firstInvestigation, "thread-b", "Second thread");
    await store.createThread(secondInvestigation, "thread-a", "Other investigation thread");

    expect((await store.listThreads(firstInvestigation)).map((thread) => thread.threadId)).toEqual(["thread-b", "thread-a"]);
    expect((await store.listThreads(secondInvestigation)).map((thread) => thread.title)).toEqual(["Other investigation thread"]);
    expect(await store.loadThread(firstInvestigation, "thread-a")).toMatchObject({ investigationId: firstInvestigation, messages: [{ role: "user", content: "Question A", snapshotRevision: 4 }] });
    expect(await store.loadThread(secondInvestigation, "thread-a")).toMatchObject({ investigationId: secondInvestigation });
  });

  it("enforces optimistic thread revisions and atomically appends validated turns", async () => {
    const store = new FileCopilotConversationStore(await temporaryRoot());
    await store.createThread(firstInvestigation, "thread-a", "Question");
    await store.appendUserMessage(firstInvestigation, "thread-a", 0, "Question", 4);
    const assistantTurn = { answer, at: "2026-10-23T00:00:00.000Z", snapshotRevision: 4 };
    const firstAppend = store.appendTurn(firstInvestigation, "thread-a", 1, "Question", assistantTurn);
    const conflictingAppend = store.appendTurn(firstInvestigation, "thread-a", 1, "Question", assistantTurn);

    await expect(firstAppend).resolves.toMatchObject({ threadRevision: 2, messages: [{ role: "user" }, { role: "assistant", answer }] });
    await expect(conflictingAppend).rejects.toThrow(/revision conflict/i);
  });

  it("persists citeable source-status records", async () => {
    const store = new FileCopilotConversationStore(await temporaryRoot());
    const sourceCitation = {
      citationId: "cite:source:sap",
      kind: "source" as const,
      label: "sap source status",
      source: "sap",
      summary: "Status: failed; freshness: stale. The snapshot does not establish why this status occurred.",
    };
    const sourceAnswer: CopilotAnswer = {
      ...answer,
      claims: [{ text: "SAP status is failed and stale.", kind: "fact", citationIds: [sourceCitation.citationId] }],
      recommendations: [],
      citations: [sourceCitation],
    };
    await store.createThread(firstInvestigation, "thread-source", "Source status");
    await store.appendUserMessage(firstInvestigation, "thread-source", 0, "Explain SAP status", 4);
    await store.appendTurn(firstInvestigation, "thread-source", 1, "Explain SAP status", {
      answer: sourceAnswer,
      at: "2026-10-26T00:00:00.000Z",
      snapshotRevision: 4,
    });

    await expect(store.loadThread(firstInvestigation, "thread-source"))
      .resolves.toMatchObject({ messages: [{ role: "user" }, { role: "assistant", answer: { citations: [sourceCitation] } }] });
  });

  it("deduplicates staged messages and completed turns by idempotency key", async () => {
    const store = new FileCopilotConversationStore(await temporaryRoot());
    await store.createThread(firstInvestigation, "thread-retry", "Retry safely");
    const staged = await store.appendUserMessage(firstInvestigation, "thread-retry", 0, "Question", 4, undefined, "retry-key-1");
    const stagedReplay = await store.appendUserMessage(firstInvestigation, "thread-retry", 0, "Question", 4, undefined, "retry-key-1");
    expect(stagedReplay).toEqual(staged);

    const completed = await store.appendTurn(firstInvestigation, "thread-retry", 1, "Question", {
      answer,
      at: "2026-10-23T00:00:00.000Z",
      snapshotRevision: 4,
      idempotencyKey: "retry-key-1",
    });
    const completedReplay = await store.appendTurn(firstInvestigation, "thread-retry", 1, "Question", {
      answer,
      at: "2026-10-23T00:00:01.000Z",
      snapshotRevision: 4,
      idempotencyKey: "retry-key-1",
    });
    expect(completedReplay).toEqual(completed);
    expect(completed.messages).toHaveLength(2);
  });

  it("retains readable thread data, and bounds user messages and stored history", async () => {
    const store = new FileCopilotConversationStore(await temporaryRoot(), { maxMessageChars: 40, maxMessagesPerThread: 4 });
    await store.createThread(firstInvestigation, "thread-a", "Long question");
    await expect(store.appendUserMessage(firstInvestigation, "thread-a", 0, "x".repeat(41), 4)).rejects.toThrow(/message length/i);
    await store.appendUserMessage(firstInvestigation, "thread-a", 0, "Question one", 4);
    await store.appendTurn(firstInvestigation, "thread-a", 1, "Question one", { answer, at: "2026-10-23T00:00:01.000Z", snapshotRevision: 4 });
    await store.appendUserMessage(firstInvestigation, "thread-a", 2, "Question two", 4);
    await store.appendTurn(firstInvestigation, "thread-a", 3, "Question two", { answer, at: "2026-10-23T00:00:02.000Z", snapshotRevision: 4 });
    await expect(store.appendUserMessage(firstInvestigation, "thread-a", 4, "Question three", 4)).rejects.toThrow(/history limit/i);
    await expect(store.loadThread(firstInvestigation, "thread-a")).resolves.toMatchObject({ messages: [{ role: "user" }, { role: "assistant" }, { role: "user" }, { role: "assistant" }] });
  });

  it("rejects path-shaped thread IDs and refuses malformed assistant answer structures", async () => {
    const store = new FileCopilotConversationStore(await temporaryRoot());
    await expect(store.createThread(firstInvestigation, "../escape", "Invalid")).rejects.toThrow(/thread id/i);
    await store.createThread(firstInvestigation, "thread-a", "Question");
    await expect(store.appendTurn(firstInvestigation, "thread-a", 0, "Question", { answer: { ...answer, claims: [{ text: "No citation", kind: "fact", citationIds: [] }] } as CopilotAnswer, at: "2026-10-23T00:00:00.000Z", snapshotRevision: 4 })).rejects.toThrow(/factual claims require citations/i);
  });

  it("persists only allowlisted answer/citation fields, dropping secrets and provider headers", async () => {
    const root = await temporaryRoot();
    const store = new FileCopilotConversationStore(root);
    await store.createThread(firstInvestigation, "thread-private", "Privacy");
    const untrustedAnswer = {
      ...answer,
      apiKey: "company-secret-must-not-persist",
      requestHeaders: { "api-key": "company-secret-must-not-persist" },
      citations: [{ ...answer.citations![0], rawProviderPayload: "provider-private-data" }],
    } as unknown as CopilotAnswer;
    await store.appendTurn(firstInvestigation, "thread-private", 0, "Question", {
      answer: untrustedAnswer,
      at: "2026-10-23T00:00:00.000Z",
      snapshotRevision: 4,
    });

    const persisted = await readFile(path.join(root, "investigation-one", "copilot", "threads", "thread-private.json"), "utf8");
    expect(persisted).not.toContain("company-secret-must-not-persist");
    expect(persisted).not.toContain("provider-private-data");
    expect(JSON.parse(persisted).messages[1].answer.citations).toEqual(answer.citations);
  });
});
