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
  forceLowConfidence: false,
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
      mocks.storedThread = thread;
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
          belowThreshold: mocks.forceLowConfidence,
        },
      };
    },
  };
});
vi.mock("../azure-openai-client", () => ({
  completeCopilotTurn: (...args: unknown[]) => mocks.completeCopilotTurn(...args),
}));

import { executeCopilotTurn } from "../execute-copilot-turn";
import { createCopilotTraceContext } from "../copilot-execution-trace";

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
  mocks.forceLowConfidence = false;
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
            explanation: "The linked SAP material may be affected; the requirement calls for thermal-cycle validation.",
            evidenceIds: ["evidence-1"],
            sourceIds: ["citation-1", "SYNTH-PASSAGE-001"],
          }],
          facts: [{
            factId: "fact-weight-1",
            exactValue: 2.5,
            exactValueJson: "2.50",
            evidenceIds: ["fact-evidence-1"],
            sourceIds: ["fact-citation-1"],
          }],
          applicationContexts: [{
            candidateId: "participation-1",
            evidenceIds: ["participation-evidence-1"],
            sourceIds: ["participation-citation-1"],
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
          }, {
            evidenceId: "SYNTH-PASSAGE-001",
            sourceType: "source-evidence-passage",
            sourceSystem: "Windchill",
            recordId: "SYNTH-NATIVE-RECORD-001",
            provenanceId: "SYNTH-PROVENANCE-001",
            authority: "Windchill",
            provider: "Windchill",
            authorizationDecisionId: "decision-1",
            citationId: "SYNTH-PASSAGE-001",
            location: "requirements[0].description",
            deepLink: "https://plm.example/records/SYNTH-NATIVE-RECORD-001",
          }, {
            evidenceId: "fact-evidence-1",
            sourceType: "engineering-fact",
            sourceSystem: "Windchill",
            recordId: "WT-REQ-123",
            provenanceId: "fact-provenance-1",
            authority: "SourceAuthoritative",
            provider: "Windchill",
            authorizationDecisionId: "decision-1",
            citationId: "fact-citation-1",
            location: "weight",
          }, {
            evidenceId: "participation-evidence-1",
            sourceType: "application-participation",
            sourceSystem: "Windchill",
            recordId: "WT-REQ-123",
            provenanceId: "participation-provenance-1",
            authority: "SourceAuthoritative",
            provider: "Windchill",
            authorizationDecisionId: "decision-1",
            citationId: "participation-citation-1",
          }],
          issues: [],
          contextPackageId: "context-1",
        },
      }),
    };

    const traceContext = createCopilotTraceContext();
    const outcome = await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "impact-runtime-connected",
      threadId: "impact-runtime-connected-thread",
      createIfMissing: true,
      message: "What is impacted if Requirement R-123 changes?",
      traceContext,
    }, { engineeringImpactRuntimeClient: runtimeClient });

    expect(outcome).toMatchObject({
      ok: true,
      answer: {
        runtime: { disposition: "Answer", contextPackageId: "context-1" },
        answer: expect.stringContaining("The linked SAP material may be affected"),
      },
    });
    expect(outcome.ok && outcome.answer.answer).toContain("thermal-cycle validation");
    expect(outcome.ok && outcome.answer.answer).toContain("Fact fact-weight-1: 2.50");
    expect(outcome.ok && outcome.answer.answer).toContain("Application participation: Windchill WT-REQ-123");
    expect(outcome.ok && outcome.answer.claims).toContainEqual(expect.objectContaining({
      text: "Fact fact-weight-1: 2.50",
      kind: "fact",
      citationIds: ["cite:source:fact-citation-1"],
    }));
    expect(outcome.ok && outcome.answer.citations).toContainEqual(expect.objectContaining({
      citationId: "cite:source:citation-1",
    }));
    expect(outcome.ok && outcome.answer.citations).toContainEqual(expect.objectContaining({
      citationId: "cite:evidence:SYNTH-PASSAGE-001",
      kind: "evidence",
      deepLink: "https://plm.example/records/SYNTH-NATIVE-RECORD-001",
    }));
    expect(outcome.ok && outcome.answer.citations).toContainEqual(expect.objectContaining({
      citationId: "cite:source:fact-citation-1",
      kind: "source",
      label: "Windchill WT-REQ-123",
    }));
    expect(outcome.ok && outcome.answer.citations).toContainEqual(expect.objectContaining({
      citationId: "cite:source:participation-citation-1",
      kind: "source",
      label: "Windchill WT-REQ-123",
    }));
    expect(runtimeClient.answer).toHaveBeenCalledOnce();
    expect(runtimeClient.answer).toHaveBeenCalledWith(expect.objectContaining({
      investigationId: String(supportedCase.snapshot.identity.investigationId),
      conversationId: "impact-runtime-connected-thread",
      turnId: "impact-runtime-connected",
      snapshotRevision: supportedCase.snapshot.identity.revision,
      traceContext: expect.objectContaining({
        requestId: traceContext.requestId,
        traceId: traceContext.traceId,
        routeSource: "UnifiedRuntime",
      }),
    }));
    expect(traceContext.routeSource).toBe("UnifiedRuntime");
    expect(mocks.completeCopilotTurn).not.toHaveBeenCalled();

    const replay = await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "impact-runtime-connected",
      threadId: "impact-runtime-connected-thread",
      message: "What is impacted if Requirement R-123 changes?",
    }, { engineeringImpactRuntimeClient: runtimeClient });

    expect(replay).toMatchObject({ ok: true, idempotentReplay: true });
    expect(replay.ok && replay.answer.citations).toContainEqual(expect.objectContaining({
      citationId: "cite:evidence:SYNTH-PASSAGE-001",
      kind: "evidence",
    }));
    expect(replay.ok && replay.answer.answer).toContain("Fact fact-weight-1: 2.50");
    expect(replay.ok && replay.answer.citations).toContainEqual(expect.objectContaining({
      citationId: "cite:source:fact-citation-1",
    }));
    expect(runtimeClient.answer).toHaveBeenCalledOnce();
  });

  it("forwards only complete successful transcript turns and anchors to the last eligible turn", async () => {
    vi.stubEnv("LATTICE_AI_RUNTIME_ENGINEERING_IMPACT_ANSWERS_ENABLED", "true");
    const investigationId = "conversation-history-investigation" as InvestigationId;
    useIsolatedRateLimitInvestigation(investigationId);
    const snapshotRevision = supportedCase.snapshot.identity.revision;
    mocks.storedThread = {
      investigationId,
      threadId: "impact-history-thread",
      title: "Conversation history",
      threadRevision: 8,
      createdAt: "2026-11-19T10:00:00Z",
      updatedAt: "2026-11-19T10:04:00Z",
      conversationState: {
        previousTurnId: "failed-state-turn",
        lastTurnDisposition: "failed",
      },
      messages: [
        {
          role: "user",
          content: "What impacts if R-123 changes?",
          at: "2026-11-19T10:00:00Z",
          snapshotRevision,
          idempotencyKey: "answer-turn",
        },
        {
          role: "assistant",
          answer: {
            answer: "The previous completed answer.",
            claims: [],
            recommendations: [],
            uncertainties: [],
            followUpQuestions: [],
            snapshotRevision,
          },
          at: "2026-11-19T10:01:00Z",
          snapshotRevision,
          idempotencyKey: "answer-turn",
        },
        {
          role: "user",
          content: "Which requirement did you assess?",
          at: "2026-11-19T10:02:00Z",
          snapshotRevision,
          idempotencyKey: "clarify-turn",
        },
        {
          role: "assistant",
          answer: {
            answer: "I assessed R-123.",
            claims: [],
            recommendations: [],
            uncertainties: [],
            followUpQuestions: [],
            snapshotRevision,
            runtime: { disposition: "Clarify" },
          },
          at: "2026-11-19T10:03:00Z",
          snapshotRevision,
          idempotencyKey: "clarify-turn",
        },
        {
          role: "user",
          content: "A request that failed.",
          at: "2026-11-19T10:03:30Z",
          snapshotRevision,
          idempotencyKey: "failed-turn",
        },
        {
          role: "assistant",
          answer: {
            answer: "The runtime could not complete this answer.",
            claims: [],
            recommendations: [],
            uncertainties: [],
            followUpQuestions: [],
            snapshotRevision,
            runtime: { disposition: "Failed" },
          },
          at: "2026-11-19T10:04:00Z",
          snapshotRevision,
          idempotencyKey: "failed-turn",
        },
        {
          role: "user",
          content: "An incomplete pending question.",
          at: "2026-11-19T10:04:30Z",
          snapshotRevision,
          idempotencyKey: "orphan-user-turn",
        },
      ],
    };
    const runtimeClient = {
      readiness: () => ({ endpointConfigured: true, credentialProviderConfigured: true }),
      answer: vi.fn().mockResolvedValue({ status: "denied" }),
    };

    await executeCopilotTurn({
      investigationId,
      expectedSnapshotRevision: snapshotRevision,
      expectedThreadRevision: 8,
      idempotencyKey: "current-turn",
      threadId: "impact-history-thread",
      message: "What is the current impact?",
    }, { engineeringImpactRuntimeClient: runtimeClient });

    expect(runtimeClient.answer).toHaveBeenCalledWith(expect.objectContaining({
      parentTurnId: "clarify-turn",
      conversationHistory: [
        {
          turnId: "answer-turn",
          userMessage: "What impacts if R-123 changes?",
          assistantMessage: expect.stringContaining("The previous completed answer."),
          disposition: "answer",
        },
        {
          turnId: "clarify-turn",
          userMessage: "Which requirement did you assess?",
          assistantMessage: expect.stringContaining("I assessed R-123."),
          disposition: "clarify",
        },
      ],
    }));
    expect(JSON.stringify(runtimeClient.answer.mock.calls[0][0])).not.toContain("The runtime could not complete");
    expect(JSON.stringify(runtimeClient.answer.mock.calls[0][0])).not.toContain("An incomplete pending question.");
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
  it("sends low-heuristic-confidence context to the model instead of constructing a fallback answer", async () => {
    const investigationId = "low-confidence-context-investigation" as InvestigationId;
    useIsolatedRateLimitInvestigation(investigationId);
    mocks.forceLowConfidence = true;

    const outcome = await executeCopilotTurn({
      investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "low-confidence-context-test",
      threadId: "low-confidence-context-thread",
      createIfMissing: true,
      message: providerQuestion,
    });

    expect(outcome).toMatchObject({ ok: true });
    expect(mocks.completeCopilotTurn).toHaveBeenCalledOnce();
  });

  it("accepts and preserves user questions longer than the historical character limit", async () => {
    const investigationId = "long-question-investigation" as InvestigationId;
    useIsolatedRateLimitInvestigation(investigationId);
    const message = `Summarize this investigation. ${"detail ".repeat(400)}`;

    const outcome = await executeCopilotTurn({
      investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "long-question-test",
      threadId: "long-question-thread",
      createIfMissing: true,
      message,
    });

    expect(outcome).toMatchObject({ ok: true });
    const request = mocks.completeCopilotTurn.mock.calls[0][0] as AzureChatRequest;
    expect(JSON.parse(request.messages.at(-1)!.content).supportingContext.userMessage).toBe(message);
  });

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

  it("traces the actual legacy context, prompt, validation, citation resolution, and persisted answer", async () => {
    const investigationId = "legacy-trace-complete-investigation" as InvestigationId;
    useIsolatedRateLimitInvestigation(investigationId);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("LATTICE_COPILOT_DIAGNOSTICS_ENABLED", "true");
    vi.stubEnv("LATTICE_COPILOT_DIAGNOSTICS_FULL_PAYLOAD_TRACE", "true");
    const traceContext = createCopilotTraceContext(new Request("https://local.test/copilot", {
      headers: { "x-copilot-diagnostic-detail": "full" },
    }));
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.completeCopilotTurn.mockImplementationOnce(async (request: AzureChatRequest) => {
      const payload = JSON.parse(request.messages.at(-1)!.content) as {
        supportingContext: { citations: { citationId: string }[]; snapshotRevision: number };
      };
      return {
        content: JSON.stringify({
          answer: "The investigation includes cross-system engineering records.",
          claims: [{
            text: "The investigation includes cross-system engineering records.",
            kind: "fact",
            citationIds: [payload.supportingContext.citations[0].citationId],
          }],
          recommendations: [],
          uncertainties: [],
          followUpQuestions: [],
          snapshotRevision: payload.supportingContext.snapshotRevision,
        }),
      };
    });

    const outcome = await executeCopilotTurn({
      investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "legacy-trace-complete",
      threadId: "legacy-trace-complete-thread",
      createIfMissing: true,
      message: "Summarize everything in this investigation.",
      traceContext,
    });

    expect(outcome).toMatchObject({
      ok: true,
      answer: { answer: expect.stringContaining("The investigation includes cross-system engineering records.") },
    });
    const events = log.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
    const legacyStages = events
      .map((event) => event.event)
      .filter((event) => [
        "legacy.graph-normalization.completed",
        "legacy.context-builder.started",
        "question.interpreted",
        "legacy.context-built",
        "prompt.assembled",
        "answer.validation.completed",
        "citations.resolved",
        "answer.finalized",
      ].includes(String(event)));
    expect(legacyStages).toEqual([
      "legacy.graph-normalization.completed",
      "legacy.context-builder.started",
      "question.interpreted",
      "legacy.context-built",
      "prompt.assembled",
      "answer.validation.completed",
      "citations.resolved",
      "answer.finalized",
    ]);

    const request = mocks.completeCopilotTurn.mock.calls[0][0] as AzureChatRequest;
    const promptEvent = events.find((event) => event.event === "prompt.assembled")!;
    expect(promptEvent).toMatchObject({
      requestId: traceContext.requestId,
      traceId: traceContext.traceId,
      routeSource: "LegacyFrontend",
      fullPayload: { messages: request.messages },
    });
    expect(events.find((event) => event.event === "legacy.context-built")).toMatchObject({
      output: {
        applicationsPresent: expect.arrayContaining(["windchill", "sap"]),
        entityCount: expect.any(Number),
        relationshipCount: expect.any(Number),
        evidenceCount: expect.any(Number),
      },
    });
    const validationEvent = events.find((event) => event.event === "answer.validation.completed")!;
    expect(validationEvent).toMatchObject({
      output: { semanticSupportAssessment: "not-performed-by-legacy-frontend-validator" },
    });
    const validationOutput = validationEvent.output as {
      assertions: { assertionType: string; assertionIndex: number; accepted: boolean; citationIds: string[] }[];
    };
    const firstClaimOutcome = validationOutput.assertions.find((item) =>
      item.assertionType === "claim" && item.assertionIndex === 0,
    );
    expect(firstClaimOutcome?.accepted).toBe(true);
    expect(firstClaimOutcome?.citationIds.length).toBeGreaterThan(0);
    const citationEvent = events.find((event) => event.event === "citations.resolved")!;
    expect(citationEvent).toMatchObject({
      output: {
        resolvedCitationCount: outcome.ok ? outcome.answer.citations?.length ?? 0 : 0,
        resolvedCitationIds: outcome.ok ? (outcome.answer.citations ?? []).map((citation) => citation.citationId) : [],
      },
    });
    expect(events.find((event) => event.event === "answer.finalized")).toMatchObject({
      outcome: "persisted-and-returned",
      output: { answerCharacters: outcome.ok ? outcome.answer.answer.length : 0 },
    });
  });
});
