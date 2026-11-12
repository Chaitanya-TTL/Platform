import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { recordCopilotTurnStage } from "../turn-stage-journal";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = undefined;
  }
});

describe("Copilot turn-stage journal", () => {
  it("appends sanitized structured events without prompts or provider content", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "copilot-turn-stage-"));
    const journalPath = path.join(temporaryDirectory, "copilot-turn-stages.jsonl");
    vi.stubEnv("LATTICE_COPILOT_STAGE_LOG_PATH", journalPath);

    await recordCopilotTurnStage({
      requestId: "request-1",
      investigationId: "investigation-1",
      threadId: "thread-1",
      snapshotRevision: 7,
      stage: "provider-response-parsed",
      error: new Error("api-key=secret-value https://provider.invalid/private"),
      responseCharacterCount: 342,
      jsonParsingResult: "passed",
      topLevelKeys: ["answer", "claims"],
      requestMayHaveBeenBilled: true,
      retryable: false,
    });

    const [line] = (await readFile(journalPath, "utf8")).trim().split("\n");
    const entry = JSON.parse(line) as Record<string, unknown>;
    expect(entry).toMatchObject({
      requestId: "request-1",
      investigationId: "investigation-1",
      threadId: "thread-1",
      snapshotRevision: 7,
      stage: "provider-response-parsed",
      errorName: "Error",
      responseCharacterCount: 342,
      jsonParsingResult: "passed",
      topLevelKeys: ["answer", "claims"],
      requestMayHaveBeenBilled: true,
      retryable: false,
    });
    expect(entry.errorMessage).toBe("api-key=[redacted] [redacted-url]");
    expect(line).not.toContain("secret-value");
    expect(line).not.toContain("provider.invalid");
    expect(line).not.toContain("full prompt");
  });

  it("records only sanitized retrieval outcomes and aggregate counts", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "copilot-retrieval-stage-"));
    const journalPath = path.join(temporaryDirectory, "copilot-turn-stages.jsonl");
    vi.stubEnv("LATTICE_COPILOT_STAGE_LOG_PATH", journalPath);

    const retrievalOutcome = {
      reasonCode: "retrieval-access-denied" as const,
      candidateCount: 3,
      allowedCount: 0,
      deniedCount: 3,
      selectedCount: 0,
      contextCharacters: 0,
      deniedCandidateIds: ["private-chunk-id"],
      excerpt: "private document text",
      sourceUri: "https://private.example/document",
      aclMembers: ["private-user"],
    };
    await recordCopilotTurnStage({
      requestId: "request-retrieval",
      investigationId: "investigation-1",
      stage: "retrieval-completed",
      retrievalOutcome,
    });

    const line = (await readFile(journalPath, "utf8")).trim();
    const entry = JSON.parse(line) as Record<string, unknown>;
    expect(entry).toMatchObject({
      requestId: "request-retrieval",
      stage: "retrieval-completed",
      retrievalOutcome: {
        reasonCode: "retrieval-access-denied",
        candidateCount: 3,
        allowedCount: 0,
        deniedCount: 3,
        selectedCount: 0,
        contextCharacters: 0,
      },
    });
    expect(line).not.toContain("private-chunk-id");
    expect(line).not.toContain("private document text");
    expect(line).not.toContain("private.example");
    expect(line).not.toContain("private-user");
  });
});
