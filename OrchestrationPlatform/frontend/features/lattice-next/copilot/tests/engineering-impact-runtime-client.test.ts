import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  EngineeringImpactRuntimeClient,
  runtimeResponseCitations,
  type EngineeringImpactRuntimeResponse,
} from "../engineering-impact-runtime-client";
import type { CopilotTraceContext } from "../copilot-execution-trace";
import { mapEngineeringImpactRuntimeCall } from "../engineering-impact-runtime-routing";
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
const traceContext: CopilotTraceContext = {
  requestId: "request-1",
  traceId: "a".repeat(32),
  traceparent: `00-${"a".repeat(32)}-${"b".repeat(16)}-01`,
  routeSource: "UnifiedRuntime",
  payloadDetail: "summary",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

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

  it("preserves structured runtime retrieval failures instead of replacing their messages", async () => {
    const failedResponse: EngineeringImpactRuntimeResponse = {
      ...runtimeResponse,
      disposition: "Failed",
      summary: null,
      impacts: [],
      issues: [{
        code: "source-evidence-unavailable",
        message: "Source evidence retrieval is unavailable.",
      }],
    };
    const fetcher = vi.fn().mockResolvedValue(response(502, failedResponse));
    const client = new EngineeringImpactRuntimeClient({
      endpoint: "https://orchestration.example/api",
      accessTokenProvider: provider({ status: "available", accessToken: "server-token" }),
      fetcher,
    });

    await expect(client.answer(request)).resolves.toMatchObject({
      status: "response",
      response: {
        disposition: "Failed",
        issues: [{
          code: "source-evidence-unavailable",
          message: "Source evidence retrieval is unavailable.",
        }],
      },
    });
  });

  it("propagates server-generated trace context without forwarding caller credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(200, runtimeResponse));
    const client = new EngineeringImpactRuntimeClient({
      endpoint: "https://orchestration.example/api",
      accessTokenProvider: provider({ status: "available", accessToken: "server-token" }),
      fetcher,
    });

    await client.answer({
      ...request,
      traceContext,
      snapshotRevision: 7,
    });

    const [, init] = fetcher.mock.calls[0];
    expect(init.headers).toMatchObject({
      "X-Copilot-Request-Id": "request-1",
      "X-Copilot-Snapshot-Revision": "7",
      "X-Copilot-Route-Source": "UnifiedRuntime",
      traceparent: traceContext.traceparent,
    });
    expect(init.headers).not.toHaveProperty("X-Copilot-Diagnostic-Detail");
  });

  it("forwards full-payload selection only for a request explicitly marked full", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(200, runtimeResponse));
    const client = new EngineeringImpactRuntimeClient({
      endpoint: "https://orchestration.example/api",
      accessTokenProvider: provider({ status: "available", accessToken: "server-token" }),
      fetcher,
    });

    await client.answer({
      ...request,
      traceContext: { ...traceContext, payloadDetail: "full" },
      snapshotRevision: 7,
    });

    const [, init] = fetcher.mock.calls[0];
    expect(init.headers["X-Copilot-Diagnostic-Detail"]).toBe("full");
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

  it("uses the local API and development credential when running the frontend in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ORCHESTRATION_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");

    const client = new EngineeringImpactRuntimeClient();

    expect(client.readiness()).toEqual({
      endpointConfigured: true,
      credentialProviderConfigured: true,
    });
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

  it("parses and maps standalone source-evidence citations without requiring a deep link", async () => {
    const responseWithPassage: EngineeringImpactRuntimeResponse = {
      ...runtimeResponse,
      sourceEvidence: [{
        passageId: "SYNTH-PASSAGE-001",
        explanation: "The Windchill source describes the requirement.",
        evidenceIds: ["SYNTH-EVIDENCE-001"],
        sourceIds: ["SYNTH-PASSAGE-001"],
      }],
      impacts: [{
        ...runtimeResponse.impacts[0],
        sourceIds: ["citation-1"],
      }],
      sources: [
        ...runtimeResponse.sources,
        {
          evidenceId: "SYNTH-EVIDENCE-001",
          sourceType: "source-evidence-passage",
          sourceSystem: "Windchill",
          recordId: "SYNTH-NATIVE-RECORD-001",
          provenanceId: "SYNTH-PROVENANCE-001",
          authority: "Windchill",
          provider: "Windchill",
          authorizationDecisionId: "decision-1",
          citationId: "SYNTH-PASSAGE-001",
          location: "requirements[0].description",
        },
      ],
    };

    const client = new EngineeringImpactRuntimeClient({
      endpoint: "https://orchestration.example",
      accessTokenProvider: provider({ status: "available", accessToken: "server-token" }),
      fetcher: vi.fn().mockResolvedValue(response(200, responseWithPassage)),
    });
    const result = await client.answer(request);
    expect(result).toMatchObject({
      status: "response",
      response: { sourceEvidence: responseWithPassage.sourceEvidence },
    });
    if (result.status !== "response") throw new Error("Expected a runtime response.");

    const { citations, sourceCitationIds } = runtimeResponseCitations(result.response);

    expect(citations).toContainEqual({
      citationId: "cite:evidence:SYNTH-PASSAGE-001",
      kind: "evidence",
      label: "Windchill SYNTH-NATIVE-RECORD-001",
      source: "Windchill",
      nativeId: "SYNTH-NATIVE-RECORD-001",
      summary: "requirements[0].description",
    });
    expect(sourceCitationIds.get("SYNTH-PASSAGE-001")).toBe("cite:evidence:SYNTH-PASSAGE-001");
    const mapped = mapEngineeringImpactRuntimeCall(
      result,
      1,
    );
    expect(mapped.claims).toContainEqual({
      text: "The Windchill source describes the requirement.",
      kind: "fact",
      citationIds: ["cite:evidence:SYNTH-PASSAGE-001"],
    });
  });

  it("parses exact fact assertions and exposes fact and participation citations", async () => {
    const responseWithEvidence = {
      ...runtimeResponse,
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
      sources: [
        ...runtimeResponse.sources,
        {
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
        },
        {
          evidenceId: "participation-evidence-1",
          sourceType: "application-participation",
          sourceSystem: "Windchill",
          recordId: "WT-REQ-123",
          provenanceId: "participation-provenance-1",
          authority: "SourceAuthoritative",
          provider: "Windchill",
          authorizationDecisionId: "decision-1",
          citationId: "participation-citation-1",
        },
      ],
    };
    const client = new EngineeringImpactRuntimeClient({
      endpoint: "https://orchestration.example",
      accessTokenProvider: provider({ status: "available", accessToken: "server-token" }),
      fetcher: vi.fn().mockResolvedValue(response(200, responseWithEvidence)),
    });

    const result = await client.answer(request);

    expect(result).toMatchObject({
      status: "response",
      response: {
        facts: [{
          factId: "fact-weight-1",
          exactValue: 2.5,
          exactValueJson: "2.50",
        }],
        applicationContexts: [{ candidateId: "participation-1" }],
      },
    });
    if (result.status !== "response") throw new Error("Expected a runtime response.");
    const { citations, sourceCitationIds } = runtimeResponseCitations(result.response);
    expect(citations.map((citation) => citation.citationId)).toContain("cite:source:fact-citation-1");
    expect(citations.map((citation) => citation.citationId))
      .toContain("cite:source:participation-citation-1");
    expect(sourceCitationIds.get("fact-citation-1")).toBe("cite:source:fact-citation-1");
    expect(sourceCitationIds.get("participation-citation-1"))
      .toBe("cite:source:participation-citation-1");
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

  it("forwards the typed server transcript while ignoring arbitrary transcript fields", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(200, runtimeResponse));
    const client = new EngineeringImpactRuntimeClient({
      endpoint: "https://orchestration.example",
      accessTokenProvider: provider({ status: "available", accessToken: "server-token" }),
      fetcher,
    });
    const assistantText = "Previously completed assistant response.";
    const injectedText = "Browser-supplied transcript must not be forwarded.";
    const conversationHistory = [
      {
        turnId: "turn-previous",
        userMessage: "What impacts if R-123 changes?",
        assistantMessage: assistantText,
        disposition: "answer",
      },
      {
        turnId: "turn-clarification",
        userMessage: "Which requirement should I assess?",
        assistantMessage: "R-123.",
        disposition: "clarify",
      },
    ] as const;
    const requestWithHistory = Object.assign({}, request, {
      conversationHistory,
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
      conversationHistory,
    });
    expect(init.body).toContain(assistantText);
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

  it("does not impose a fixed end-to-end timeout on multi-stage runtime requests", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(200, runtimeResponse));
    const client = new EngineeringImpactRuntimeClient({
      endpoint: "https://orchestration.example",
      accessTokenProvider: provider({ status: "available", accessToken: "server-token" }),
      fetcher,
    });

    await client.answer(request);

    expect(fetcher.mock.calls[0][1]?.signal).toBeUndefined();
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
