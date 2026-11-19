import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  EngineeringImpactRuntimeClient,
  type EngineeringImpactRuntimeResponse,
} from "../engineering-impact-runtime-client";
import type { RuntimeAccessTokenProvider } from "../runtime-access-token-provider";
import type { ConversationState } from "../contracts";

const priorState: ConversationState = {
  schemaVersion: 1,
  conversationId: "thread-1",
  investigationId: "INV-123",
  stateVersion: 2,
  currentSubjectIds: ["REQ-123"],
  currentValidatedEntityRefs: [{ canonicalId: "REQ-123", entityKind: "Requirement", application: "Codebeamer" }],
  applicationFilters: { sourceApplications: [], targetApplications: [] },
  relationshipFilters: [],
  impactScope: { relationshipTypes: [], maxHops: 3, sourceSystems: [], asOf: null },
  outputDimension: "impact",
  previousTurnId: "turn-1",
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
};

const runtimeResponse: EngineeringImpactRuntimeResponse = {
  investigationId: "INV-123",
  requestContext: {
    requestId: "request-1",
    traceId: "trace-1",
    conversationId: "thread-1",
    turnId: "turn-1",
  },
  disposition: "Answer",
  summary: "Requirement R-123 has a supported impact.",
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
    deepLink: "https://plm.example/records/MAT-200",
  }],
  issues: [],
  contextPackageId: "context-1",
  continuationState: priorState,
};

function provider(result: Awaited<ReturnType<RuntimeAccessTokenProvider["getAccessToken"]>>): RuntimeAccessTokenProvider {
  return {
    isConfigured: () => true,
    getAccessToken: vi.fn().mockResolvedValue(result),
  };
}

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
  });
}

const request = {
  question: "What is impacted if R-123 changes?",
  investigationId: "INV-123",
  conversationId: "thread-1",
  turnId: "turn-1",
};

describe("EngineeringImpactRuntimeClient", () => {
  it("uses the server-side credential provider and forwards only server-loaded structured state", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(200, runtimeResponse));
    const client = new EngineeringImpactRuntimeClient({
      endpoint: "https://orchestration.example/api",
      accessTokenProvider: provider({ status: "available", accessToken: "server-token" }),
      fetcher,
    });

    await expect(client.answer({
      ...request,
      turnId: "turn-2",
      parentTurnId: "turn-1",
      previousConversationState: priorState,
    })).resolves.toMatchObject({
      status: "response",
      response: {
        contextPackageId: "context-1",
        disposition: "Answer",
        continuationState: priorState,
      },
    });

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://orchestration.example/api/engineering/impact-answer");
    expect(init.headers.authorization).toBe("Bearer server-token");
    expect(JSON.parse(init.body)).toEqual({
      investigationId: "INV-123",
      question: "What is impacted if R-123 changes?",
      conversationId: "thread-1",
      turnId: "turn-2",
      parentTurnId: "turn-1",
      previousConversationState: priorState,
    });
    expect(init.body).not.toContain("accessToken");
  });

  it("reports missing endpoint or credential configuration without making a request", async () => {
    const fetcher = vi.fn();
    const tokenProvider = provider({ status: "unavailable" });
    const client = new EngineeringImpactRuntimeClient({
      endpoint: "",
      accessTokenProvider: tokenProvider,
      fetcher,
    });

    expect(client.readiness()).toEqual({
      endpointConfigured: false,
      credentialProviderConfigured: true,
    });
    await expect(client.answer(request)).resolves.toEqual({
      status: "unavailable",
      code: "runtime-endpoint-not-configured",
    });
    expect(tokenProvider.getAccessToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("distinguishes unavailable and failed credential acquisition", async () => {
    const unavailableClient = new EngineeringImpactRuntimeClient({
      endpoint: "https://orchestration.example",
      accessTokenProvider: provider({ status: "unavailable" }),
      fetcher: vi.fn(),
    });
    const failedClient = new EngineeringImpactRuntimeClient({
      endpoint: "https://orchestration.example",
      accessTokenProvider: provider({ status: "failed" }),
      fetcher: vi.fn(),
    });

    await expect(unavailableClient.answer(request)).resolves.toMatchObject({
      status: "unavailable",
      code: "runtime-credential-not-configured",
    });
    await expect(failedClient.answer(request)).resolves.toMatchObject({
      status: "failed",
      code: "runtime-credential-acquisition-failed",
    });
  });

  it.each([
    [401, { status: "failed", code: "runtime-credential-rejected" }],
    [403, { status: "denied" }],
    [503, { status: "unavailable", code: "runtime-authorization-unavailable" }],
  ] as const)("maps HTTP %s without exposing response content", async (status, expected) => {
    const client = new EngineeringImpactRuntimeClient({
      endpoint: "https://orchestration.example",
      accessTokenProvider: provider({ status: "available", accessToken: "server-token" }),
      fetcher: vi.fn().mockResolvedValue(response(status, { detail: "private diagnostic" })),
    });

    await expect(client.answer(request)).resolves.toEqual(expected);
  });

  it("preserves clarification and abstention runtime results", async () => {
    for (const disposition of ["Clarify", "Abstain"] as const) {
      const fetcher = vi.fn().mockResolvedValue(response(422, {
        ...runtimeResponse,
        disposition,
        summary: null,
        impacts: [],
        issues: [{ code: "question-clarification-required", message: "Which item do you mean?" }],
      }));
      const client = new EngineeringImpactRuntimeClient({
        endpoint: "https://orchestration.example",
        accessTokenProvider: provider({ status: "available", accessToken: "server-token" }),
        fetcher,
      });

      await expect(client.answer(request)).resolves.toMatchObject({
        status: "response",
        response: { disposition, issues: [{ message: "Which item do you mean?" }] },
      });
    }
  });

  it("preserves the answer when optional continuation state is malformed", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(200, {
      ...runtimeResponse,
      continuationState: { ...priorState, stateVersion: 0 },
    }));
    const client = new EngineeringImpactRuntimeClient({
      endpoint: "https://orchestration.example",
      accessTokenProvider: provider({ status: "available", accessToken: "server-token" }),
      fetcher,
    });

    await expect(client.answer(request)).resolves.toMatchObject({
      status: "response",
      response: {
        disposition: "Answer",
        continuationStateStatus: "invalid",
      },
    });
  });

  it("does not forward prior assistant prose or transcript history to the runtime", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(200, runtimeResponse));
    const client = new EngineeringImpactRuntimeClient({
      endpoint: "https://orchestration.example",
      accessTokenProvider: provider({ status: "available", accessToken: "server-token" }),
      fetcher,
    });
    const injectedText = "Prior assistant prose must never become engineering evidence.";
    const requestWithHistory = Object.assign({}, request, {
      priorAssistantAnswer: injectedText,
      transcript: Array.from({ length: 250 }, (_, index) => ({
        role: index % 2 ? "assistant" : "user",
        content: `${index}-${injectedText}`,
      })),
    });

    await client.answer(requestWithHistory);

    const [, init] = fetcher.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      investigationId: request.investigationId,
      question: request.question,
      conversationId: request.conversationId,
      turnId: request.turnId,
    });
    expect(init.body).not.toContain(injectedText);
  });

  it("does not turn a cancellation into a successful runtime result", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = new EngineeringImpactRuntimeClient({
      endpoint: "https://orchestration.example",
      accessTokenProvider: provider({ status: "available", accessToken: "server-token" }),
      fetcher: vi.fn(),
    });

    await expect(client.answer({ ...request, signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("bounds the runtime request and reports its timeout as unavailable", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("request aborted")), { once: true });
      }),
    );
    const client = new EngineeringImpactRuntimeClient({
      endpoint: "https://orchestration.example",
      accessTokenProvider: provider({ status: "available", accessToken: "server-token" }),
      fetcher,
      timeoutMs: 20,
    });

    await expect(client.answer(request)).resolves.toEqual({
      status: "unavailable",
      code: "runtime-request-timeout",
    });
  });
});
