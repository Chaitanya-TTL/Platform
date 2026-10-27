import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AzureChatRequest } from "../azure-openai-client";
import { COPILOT_EVALUATION_CASES } from "../evals/cases";
import type { InvestigationId } from "../../kernel/contracts/investigation-identity";
import type { CopilotConversationStore } from "../../kernel/ports/copilot-conversation-store";

const mocks = vi.hoisted(() => ({
  relationshipGuidanceUnavailable: false,
  loadSnapshot: vi.fn(),
  completeCopilotTurn: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const originalReadFileSync = actual.readFileSync as (...args: unknown[]) => unknown;
  return {
    ...actual,
    readFileSync: ((...args: unknown[]) => {
      if (mocks.relationshipGuidanceUnavailable) throw new Error("Relationship guidance unavailable");
      return originalReadFileSync(...args);
    }) as typeof actual.readFileSync,
  };
});
vi.mock("../../kernel/server/server-kernel-runtime", () => ({
  serverKernel: { load: (...args: unknown[]) => mocks.loadSnapshot(...args) },
}));
vi.mock("../../kernel/server/file-copilot-conversation-store", () => ({
  FileCopilotConversationStore: class implements CopilotConversationStore {
    async listThreads() {
      return [];
    }

    async loadThread() {
      return undefined;
    }

    async createThread(investigationId: InvestigationId, threadId: string, title: string) {
      const now = new Date().toISOString();
      return { investigationId, threadId, title, threadRevision: 0, createdAt: now, updatedAt: now, messages: [] };
    }

    async appendUserMessage(
      investigationId: InvestigationId,
      threadId: string,
      _expectedThreadRevision: number,
      message: string,
      snapshotRevision: number,
      occurredAt?: string,
      idempotencyKey?: string,
    ) {
      const now = occurredAt ?? new Date().toISOString();
      return {
        investigationId,
        threadId,
        title: message.slice(0, 160),
        threadRevision: 1,
        createdAt: now,
        updatedAt: now,
        messages: [{ role: "user" as const, content: message, at: now, snapshotRevision, idempotencyKey }],
      };
    }

    async appendTurn(
      investigationId: InvestigationId,
      threadId: string,
      _expectedThreadRevision: number,
      userMessage: string,
      assistantTurn: Parameters<CopilotConversationStore["appendTurn"]>[4],
    ) {
      const now = assistantTurn.at;
      return {
        investigationId,
        threadId,
        title: userMessage.slice(0, 160),
        threadRevision: 2,
        createdAt: now,
        updatedAt: now,
        messages: [
          { role: "user" as const, content: userMessage, at: now, snapshotRevision: assistantTurn.snapshotRevision, idempotencyKey: assistantTurn.idempotencyKey },
          { role: "assistant" as const, ...assistantTurn },
        ],
      };
    }
  },
}));
vi.mock("../azure-openai-client", () => ({
  completeCopilotTurn: (...args: unknown[]) => mocks.completeCopilotTurn(...args),
}));

import { executeCopilotTurn } from "../execute-copilot-turn";

const supportedCase = COPILOT_EVALUATION_CASES.find((item) => item.id === "supported-cross-system-consequence")!;

function configureProviderResponse(): void {
  mocks.completeCopilotTurn.mockImplementation(async (request: AzureChatRequest) => {
    const userMessage = JSON.parse(request.messages.at(-1)!.content) as {
      investigationContext: { snapshotRevision: number };
    };
    return {
      content: JSON.stringify({
        answer: "The engineering part is represented by a SAP material, linking it to operational data.",
        claims: [],
        recommendations: [],
        uncertainties: [],
        followUpQuestions: [],
        snapshotRevision: userMessage.investigationContext.snapshotRevision,
      }),
    };
  });
}

beforeEach(() => {
  mocks.relationshipGuidanceUnavailable = false;
  mocks.loadSnapshot.mockReset().mockResolvedValue(supportedCase.snapshot);
  mocks.completeCopilotTurn.mockReset();
  configureProviderResponse();
});

describe("executeCopilotTurn relationship guidance", () => {
  it("includes_relevant_relationship_guidance_in_the_model_context", async () => {
    const outcome = await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "relationship-guidance-test",
      threadId: "relationship-guidance-thread",
      createIfMissing: true,
      message: supportedCase.question,
    });

    expect(outcome.ok).toBe(true);
    const request = mocks.completeCopilotTurn.mock.calls[0][0] as AzureChatRequest;
    const requestContext = JSON.parse(request.messages.at(-1)!.content).investigationContext;
    expect(requestContext.relationshipGuidance).toContainEqual(expect.objectContaining({
      sourceApplication: "Windchill",
      targetApplication: "SAP",
    }));
    expect(requestContext.relationshipGuidance.find((item: { sourceApplication: string; targetApplication: string }) =>
      item.sourceApplication === "Windchill" && item.targetApplication === "SAP",
    ).content).toMatch(/operational/i);
  });

  it("fails_clearly_without_contacting_the_model_when_relationship_guidance_is_unavailable", async () => {
    mocks.relationshipGuidanceUnavailable = true;

    const outcome = await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "relationship-guidance-failure",
      threadId: "relationship-guidance-failure-thread",
      createIfMissing: true,
      message: supportedCase.question,
    });

    expect(outcome).toMatchObject({
      ok: false,
      status: 503,
      body: { message: expect.stringMatching(/authoritative relationship guidance/i) },
    });
    expect(mocks.completeCopilotTurn).not.toHaveBeenCalled();
  });

  it("separates_relationship_semantics_from_instance_evidence", async () => {
    await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "relationship-semantics-test",
      threadId: "relationship-semantics-thread",
      createIfMissing: true,
      message: supportedCase.question,
    });

    const request = mocks.completeCopilotTurn.mock.calls[0][0] as AzureChatRequest;
    const systemMessage = request.messages.find((item) => item.role === "system")!.content;
    const requestContext = JSON.parse(request.messages.at(-1)!.content).investigationContext;
    expect(systemMessage).toMatch(/relationship definitions.*do not.*prove.*specific relationship instance/i);
    expect(systemMessage).toMatch(/MAY_IMPACT.*causation/i);
    expect(requestContext.relationships).toContainEqual(expect.objectContaining({
      relationshipId: "eval:relationship:wc-sap-consequence",
      semanticGuidanceAvailable: true,
    }));
  });

  it("does_not_require_a_fixed_sentence_or_claim_count", async () => {
    await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "relationship-answer-length-test",
      threadId: "relationship-answer-length-thread",
      createIfMissing: true,
      message: supportedCase.question,
    });

    const request = mocks.completeCopilotTurn.mock.calls[0][0] as AzureChatRequest;
    const systemMessage = request.messages.find((item) => item.role === "system")!.content;
    expect(systemMessage).not.toMatch(/at most two short sentences|at most three distinct claims/i);
    expect(systemMessage).toMatch(/engineering consequence/i);
    expect(systemMessage).toMatch(/why it matters/i);
  });
});
