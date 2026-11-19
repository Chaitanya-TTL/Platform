import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AzureChatRequest } from "../azure-openai-client";
import { COPILOT_EVALUATION_CASES } from "../evals/cases";
import type { InvestigationId } from "../../kernel/contracts/investigation-identity";
import type {
  CopilotConversationStore,
  CopilotConversationThread,
} from "../../kernel/ports/copilot-conversation-store";
import type { ConversationState } from "../contracts";

const mocks = vi.hoisted(() => ({
  relationshipGuidanceUnavailable: false,
  loadSnapshot: vi.fn(),
  completeCopilotTurn: vi.fn(),
  storedThread: undefined as unknown,
  appendedState: undefined as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("../../kernel/server/server-kernel-runtime", () => ({
  serverKernel: { load: (...args: unknown[]) => mocks.loadSnapshot(...args) },
}));
vi.mock("../../plm-brain/universal/ensure-investigation-knowledge-graph", () => ({
  ensureInvestigationKnowledgeGraph: (snapshot: unknown) => {
    if (mocks.relationshipGuidanceUnavailable) throw new Error("Relationship guidance unavailable");
    return snapshot;
  },
}));
vi.mock("../../kernel/server/file-copilot-conversation-store", () => ({
  FileCopilotConversationStore: class implements CopilotConversationStore {
    async listThreads() {
      return [];
    }

    async loadThread() {
      return mocks.storedThread as CopilotConversationThread | undefined;
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
        threadRevision: _expectedThreadRevision + 1,
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
      nextConversationState?: ConversationState | null,
    ) {
      const now = assistantTurn.at;
      mocks.appendedState = nextConversationState;
      const thread: CopilotConversationThread = {
        investigationId,
        threadId,
        title: userMessage.slice(0, 160),
        threadRevision: _expectedThreadRevision + 1,
        createdAt: now,
        updatedAt: now,
        messages: [
          { role: "user" as const, content: userMessage, at: now, snapshotRevision: assistantTurn.snapshotRevision, idempotencyKey: assistantTurn.idempotencyKey },
          { role: "assistant" as const, ...assistantTurn },
        ],
        ...(nextConversationState
          ? { conversationState: nextConversationState }
          : nextConversationState === null
            ? {}
            : (mocks.storedThread as CopilotConversationThread | undefined)?.conversationState
              ? { conversationState: (mocks.storedThread as CopilotConversationThread).conversationState }
              : {}),
      };
      return thread;
    }
  },
}));
vi.mock("../context-builder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../context-builder")>();
  return {
    ...actual,
    buildInvestigationContext: (...args: Parameters<typeof actual.buildInvestigationContext>) => {
      const relationshipDocument = readFileSync(resolve(process.cwd(), "..", "docs", "relationships.md"), "utf8");
      const packet = actual.buildInvestigationContext(args[0], args[1], {
        ...args[2],
        relationshipDocument,
      });
      return {
        ...packet,
        retrievalConfidence: {
          ...packet.retrievalConfidence,
          belowThreshold: false,
        },
      };
    },
  };
});
vi.mock("../azure-openai-client", () => ({
  completeCopilotTurn: (...args: unknown[]) => mocks.completeCopilotTurn(...args),
}));

import { executeCopilotTurn } from "../execute-copilot-turn";

const supportedCase = COPILOT_EVALUATION_CASES.find((item) => item.id === "supported-cross-system-consequence")!;
const providerQuestion = "What operational consequence follows from Windchill OR:wt.part.WTPart:9001 being represented as SAP MAT-200?";
const providerTestSnapshot = {
  ...supportedCase.snapshot,
  canonical: {
    ...supportedCase.snapshot.canonical!,
    value: {
      ...supportedCase.snapshot.canonical!.value,
      evidence: [
        ...supportedCase.snapshot.canonical!.value.evidence,
        ...supportedCase.snapshot.canonical!.value.evidence,
      ],
    },
  },
};

function useIsolatedRateLimitInvestigation(investigationId: string): void {
  mocks.loadSnapshot.mockResolvedValue({
    ...providerTestSnapshot,
    identity: {
      ...providerTestSnapshot.identity,
      investigationId: investigationId as InvestigationId,
    },
  });
}

function configureProviderResponse(): void {
  mocks.completeCopilotTurn.mockImplementation(async (request: AzureChatRequest) => {
    const userMessage = JSON.parse(request.messages.at(-1)!.content) as {
      supportingContext: { snapshotRevision: number };
    };
    return {
      content: JSON.stringify({
        answer: "The engineering part is represented by a SAP material, linking it to operational data.",
        claims: [],
        recommendations: [],
        uncertainties: [],
        followUpQuestions: [],
        snapshotRevision: userMessage.supportingContext.snapshotRevision,
      }),
    };
  });
}

beforeEach(() => {
  vi.stubEnv("LATTICE_AI_RUNTIME_ENGINEERING_IMPACT_ANSWERS_ENABLED", "false");
  mocks.storedThread = undefined;
  mocks.appendedState = undefined;
  mocks.relationshipGuidanceUnavailable = false;
  mocks.loadSnapshot.mockReset().mockResolvedValue(providerTestSnapshot);
  mocks.completeCopilotTurn.mockReset();
  configureProviderResponse();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("executeCopilotTurn engineering impact routing", () => {
  it("uses the existing Copilot path when the server-side feature flag is disabled", async () => {
    vi.stubEnv("LATTICE_AI_RUNTIME_ENGINEERING_IMPACT_ANSWERS_ENABLED", "false");

    const outcome = await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "impact-runtime-disabled",
      threadId: "impact-runtime-disabled-thread",
      createIfMissing: true,
      message: "What is impacted if R-123 changes?",
    });

    expect(mocks.loadSnapshot).toHaveBeenCalledOnce();
    expect(outcome).not.toMatchObject({
      ok: false,
      body: { failureCode: "ai-runtime-rollout-blocked" },
    });
  });

  it("persists one unavailable answer when runtime credentials are not configured", async () => {
    vi.stubEnv("LATTICE_AI_RUNTIME_ENGINEERING_IMPACT_ANSWERS_ENABLED", "true");

    const outcome = await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "impact-runtime-blocked",
      threadId: "impact-runtime-blocked-thread",
      createIfMissing: true,
      message: "What is impacted if Requirement R-123 changes?",
    });

    expect(outcome).toMatchObject({
      ok: true,
      answer: { runtime: { disposition: "Unavailable" } },
    });
    expect(mocks.loadSnapshot).toHaveBeenCalledOnce();
    expect(mocks.completeCopilotTurn).not.toHaveBeenCalled();
  });

  it("calls the configured runtime once and never invokes the legacy model", async () => {
    vi.stubEnv("LATTICE_AI_RUNTIME_ENGINEERING_IMPACT_ANSWERS_ENABLED", "true");
    const runtimeClient = {
      readiness: () => ({ endpointConfigured: true, credentialProviderConfigured: true }),
      answer: vi.fn().mockResolvedValue({
        status: "response",
        response: {
          investigationId: String(supportedCase.snapshot.identity.investigationId),
          requestContext: { requestId: "request-1", traceId: "trace-1" },
          disposition: "Answer",
          summary: "Requirement R-123 reaches SAP MAT-200 through the validated engineering relationship.",
          impacts: [{
            claimId: "impact-1",
            explanation: "The linked SAP material may be affected.",
            evidenceIds: ["evidence-1"],
            sourceIds: ["citation-1"],
          }],
          sources: [{
            evidenceId: "evidence-1",
            sourceType: "record",
            sourceSystem: "SAP",
            recordId: "MAT-200",
            provenanceId: "provenance-1",
            authority: "PLM Brain",
            provider: "SAP",
            authorizationDecisionId: "decision-1",
            citationId: "citation-1",
          }],
          issues: [],
          contextPackageId: "context-1",
        },
      }),
    };

    const outcome = await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "impact-runtime-connected",
      threadId: "impact-runtime-connected-thread",
      createIfMissing: true,
      message: "What is impacted if Requirement R-123 changes?",
    }, { engineeringImpactRuntimeClient: runtimeClient });

    expect(outcome).toMatchObject({
      ok: true,
      answer: {
        runtime: { disposition: "Answer", contextPackageId: "context-1" },
        answer: expect.stringContaining("The linked SAP material may be affected."),
        citations: [{ citationId: "cite:source:citation-1" }],
      },
    });
    expect(runtimeClient.answer).toHaveBeenCalledOnce();
    expect(runtimeClient.answer).toHaveBeenCalledWith(expect.objectContaining({
      investigationId: String(supportedCase.snapshot.identity.investigationId),
      conversationId: "impact-runtime-connected-thread",
      turnId: "impact-runtime-connected",
    }));
    expect(mocks.completeCopilotTurn).not.toHaveBeenCalled();
  });

  it("loads prior structured state on the server and atomically saves runtime continuation state", async () => {
    vi.stubEnv("LATTICE_AI_RUNTIME_ENGINEERING_IMPACT_ANSWERS_ENABLED", "true");
    const investigationId = String(supportedCase.snapshot.identity.investigationId);
    const previousState: ConversationState = {
      schemaVersion: 1,
      conversationId: "impact-state-thread",
      investigationId,
      stateVersion: 1,
      currentSubjectIds: ["REQ-123"],
      currentValidatedEntityRefs: [{ canonicalId: "REQ-123", entityKind: "Requirement", application: "Codebeamer" }],
      applicationFilters: { sourceApplications: [], targetApplications: [] },
      relationshipFilters: [],
      impactScope: { relationshipTypes: [], maxHops: 3, sourceSystems: [], asOf: null },
      outputDimension: "impact",
      previousTurnId: "prior-turn",
      previousContextPackageId: "prior-context",
      snapshotRevision: null,
      sourceVersion: "source-v1",
      ontologyVersion: "ontology-v1",
      ownerFingerprint: "a".repeat(64),
      unresolvedReference: null,
      lastTurnDisposition: "answer",
      createdAt: "2026-11-19T10:00:00Z",
      updatedAt: "2026-11-19T10:00:00Z",
      expiresAt: "2026-11-20T10:00:00Z",
    };
    const nextState: ConversationState = {
      ...previousState,
      stateVersion: 2,
      previousTurnId: "follow-up-turn",
      previousContextPackageId: "context-2",
      sourceVersion: "source-v2",
      updatedAt: "2026-11-19T10:01:00Z",
    };
    mocks.storedThread = {
      investigationId: supportedCase.snapshot.identity.investigationId,
      threadId: "impact-state-thread",
      title: "Impact question",
      threadRevision: 2,
      createdAt: previousState.createdAt,
      updatedAt: previousState.updatedAt,
      conversationState: previousState,
      messages: [
        {
          role: "user",
          content: "What impacts if R-123 changes?",
          at: previousState.createdAt,
          snapshotRevision: supportedCase.snapshot.identity.revision,
          idempotencyKey: "prior-user-turn",
        },
        {
          role: "assistant",
          answer: {
            answer: "A previous answer.",
            claims: [],
            recommendations: [],
            uncertainties: [],
            followUpQuestions: [],
            snapshotRevision: supportedCase.snapshot.identity.revision,
          },
          at: previousState.updatedAt,
          snapshotRevision: supportedCase.snapshot.identity.revision,
          idempotencyKey: "prior-turn",
        },
      ],
    };
    const runtimeClient = {
      readiness: () => ({ endpointConfigured: true, credentialProviderConfigured: true }),
      answer: vi.fn().mockResolvedValue({
        status: "response",
        response: {
          investigationId,
          requestContext: { requestId: "request-2", traceId: "trace-2" },
          disposition: "Answer",
          summary: "The current impact is supported.",
          impacts: [],
          sources: [],
          issues: [],
          continuationState: nextState,
        },
      }),
    };

    await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      expectedThreadRevision: 2,
      idempotencyKey: "follow-up-turn",
      threadId: "impact-state-thread",
      message: "What about that impact?",
    }, { engineeringImpactRuntimeClient: runtimeClient });

    expect(runtimeClient.answer).toHaveBeenCalledWith(expect.objectContaining({
      parentTurnId: "prior-turn",
      previousConversationState: previousState,
    }));
    expect(mocks.appendedState).toEqual(nextState);
    expect(mocks.completeCopilotTurn).not.toHaveBeenCalled();
  });

  it("does not write continuation state after runtime denial", async () => {
    vi.stubEnv("LATTICE_AI_RUNTIME_ENGINEERING_IMPACT_ANSWERS_ENABLED", "true");
    const investigationId = String(supportedCase.snapshot.identity.investigationId);
    mocks.storedThread = {
      investigationId: supportedCase.snapshot.identity.investigationId,
      threadId: "impact-runtime-denied-thread",
      title: "Existing state",
      threadRevision: 2,
      createdAt: "2026-11-19T10:00:00Z",
      updatedAt: "2026-11-19T10:00:00Z",
      conversationState: {
        schemaVersion: 1,
        conversationId: "impact-runtime-denied-thread",
        investigationId,
        stateVersion: 1,
        currentSubjectIds: ["REQ-123"],
        currentValidatedEntityRefs: [{ canonicalId: "REQ-123", entityKind: "Requirement", application: "Codebeamer" }],
        applicationFilters: { sourceApplications: [], targetApplications: [] },
        relationshipFilters: [],
        impactScope: { relationshipTypes: [], maxHops: 3, sourceSystems: [], asOf: null },
        outputDimension: "impact",
        previousTurnId: "prior-turn",
        previousContextPackageId: "context-1",
        snapshotRevision: null,
        sourceVersion: "source-v1",
        ontologyVersion: "ontology-v1",
        ownerFingerprint: "a".repeat(64),
        unresolvedReference: null,
        lastTurnDisposition: "answer",
        createdAt: "2026-11-19T10:00:00Z",
        updatedAt: "2026-11-19T10:00:00Z",
        expiresAt: "2026-11-20T10:00:00Z",
      },
      messages: [{
        role: "assistant",
        answer: {
          answer: "A previous answer.",
          claims: [],
          recommendations: [],
          uncertainties: [],
          followUpQuestions: [],
          snapshotRevision: supportedCase.snapshot.identity.revision,
        },
        at: "2026-11-19T10:00:00Z",
        snapshotRevision: supportedCase.snapshot.identity.revision,
        idempotencyKey: "prior-turn",
      }],
    };
    const runtimeClient = {
      readiness: () => ({ endpointConfigured: true, credentialProviderConfigured: true }),
      answer: vi.fn().mockResolvedValue({ status: "denied" }),
    };

    await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedThreadRevision: 2,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "impact-runtime-denied",
      threadId: "impact-runtime-denied-thread",
      message: "What is impacted if Requirement R-123 changes?",
    }, { engineeringImpactRuntimeClient: runtimeClient });

    expect(mocks.appendedState).toBeUndefined();
    expect(mocks.completeCopilotTurn).not.toHaveBeenCalled();
  });

  it.each([
    ["denial", { status: "denied" }],
    ["clarification", {
      status: "response",
      response: {
        investigationId: String(supportedCase.snapshot.identity.investigationId),
        requestContext: { requestId: "request-1", traceId: "trace-1" },
        disposition: "Clarify",
        summary: null,
        impacts: [],
        sources: [],
        issues: [{ code: "question-clarification-required", message: "Which requirement should I assess?" }],
      },
    }],
  ] as const)("does not fall back after runtime %s", async (_label, result) => {
    vi.stubEnv("LATTICE_AI_RUNTIME_ENGINEERING_IMPACT_ANSWERS_ENABLED", "true");
    const runtimeClient = {
      readiness: () => ({ endpointConfigured: true, credentialProviderConfigured: true }),
      answer: vi.fn().mockResolvedValue(result),
    };

    const outcome = await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: `impact-runtime-${_label}`,
      threadId: `impact-runtime-${_label}-thread`,
      createIfMissing: true,
      message: "What is impacted if Requirement R-123 changes?",
    }, { engineeringImpactRuntimeClient: runtimeClient });

    expect(outcome).toMatchObject({ ok: true });
    expect(mocks.completeCopilotTurn).not.toHaveBeenCalled();
  });
});

describe("executeCopilotTurn relationship guidance", () => {
  it("includes_relevant_relationship_guidance_in_the_model_context", async () => {
    const outcome = await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "relationship-guidance-test",
      threadId: "relationship-guidance-thread",
      createIfMissing: true,
      message: providerQuestion,
    });

    expect(outcome.ok).toBe(true);
    const request = mocks.completeCopilotTurn.mock.calls[0][0] as AzureChatRequest;
    const requestContext = JSON.parse(request.messages.at(-1)!.content).supportingContext;
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
      message: providerQuestion,
    });

    expect(outcome).toMatchObject({
      ok: false,
      status: 503,
      body: { message: expect.stringMatching(/authoritative relationship (guidance|ontology)/i) },
    });
    expect(mocks.completeCopilotTurn).not.toHaveBeenCalled();
  });

  it("separates_relationship_semantics_from_instance_evidence", async () => {
    const outcome = await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "relationship-semantics-test",
      threadId: "relationship-semantics-thread",
      createIfMissing: true,
      message: providerQuestion,
    });

    expect(outcome).toMatchObject({ ok: true });
    const request = mocks.completeCopilotTurn.mock.calls[0][0] as AzureChatRequest;
    const systemMessage = request.messages.find((item) => item.role === "system")!.content;
    const requestContext = JSON.parse(request.messages.at(-1)!.content).supportingContext;
    expect(systemMessage).toMatch(/relationship definitions.*do not.*prove.*specific relationship instance/i);
    expect(systemMessage).toMatch(/MAY_IMPACT.*causation/i);
    expect(requestContext.relationships).toContainEqual(expect.objectContaining({
      relationshipId: "eval:relationship:wc-sap-consequence",
      semanticGuidanceAvailable: true,
    }));
  });

  it("does_not_require_a_fixed_sentence_or_claim_count", async () => {
    const investigationId = "relationship-answer-length-investigation" as InvestigationId;
    useIsolatedRateLimitInvestigation(investigationId);
    const outcome = await executeCopilotTurn({
      investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "relationship-answer-length-test",
      threadId: "relationship-answer-length-thread",
      createIfMissing: true,
      message: providerQuestion,
    });

    expect(outcome).toMatchObject({ ok: true });
    const request = mocks.completeCopilotTurn.mock.calls[0][0] as AzureChatRequest;
    const systemMessage = request.messages.find((item) => item.role === "system")!.content;
    expect(systemMessage).not.toMatch(/at most two short sentences|at most three distinct claims/i);
    expect(systemMessage).toMatch(/engineering consequence/i);
    expect(systemMessage).toMatch(/why it matters/i);
  });

  it("repairs_provider_claim_shape_before_validation", async () => {
    const investigationId = "provider-repair-investigation" as InvestigationId;
    useIsolatedRateLimitInvestigation(investigationId);
    mocks.completeCopilotTurn.mockResolvedValueOnce({
      content: JSON.stringify({
        answer: "The part is represented by an operational SAP material.",
        claims: [{ text: "The provider supplied an unknown citation.", kind: "fact", citationIds: ["provider-made-up-id"] }],
        recommendations: [{ text: "Ignore this malformed recommendation.", rationale: "It has no usable citation.", approvalRequired: false }],
        snapshotRevision: -1,
      }),
    });

    const outcome = await executeCopilotTurn({
      investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "provider-repair-test",
      threadId: "provider-repair-thread",
      createIfMissing: true,
      message: providerQuestion,
    });

    expect(outcome).toMatchObject({ ok: true });
    if (outcome.ok) {
      expect(outcome.answer.snapshotRevision).toBe(supportedCase.snapshot.identity.revision);
      expect(outcome.answer.recommendations).toHaveLength(0);
    }
  });
});
