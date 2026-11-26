import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InvestigationSnapshot } from "../../kernel/contracts/investigation-snapshot";
import type {
  CopilotAssistantMessage,
  CopilotConversationStore,
  CopilotConversationThread,
  CopilotUserMessage,
} from "../../kernel/ports/copilot-conversation-store";
import type { InvestigationId } from "../../kernel/contracts/investigation-identity";
import type { ConversationState } from "../contracts";
import {
  buildSprint1A5GoldenInvestigation,
  buildSprint1A5Snapshot,
} from "../../tests/sprint-1a5-fixture-support";

const mocks = vi.hoisted(() => ({
  loadSnapshot: vi.fn(),
  contextPackets: [] as unknown[],
  providerCalls: [] as Array<{
    requestBody: Record<string, unknown>;
    status: number;
    endpointHost: string;
    requestPath: string;
    deployment?: string;
    apiVersion?: string;
    authMode: string;
    responseHeaders: Record<string, string>;
    providerErrorCode?: string;
    providerErrorMessage?: string;
    rawAnswer?: string;
    usage?: Record<string, number>;
  }>,
}));

vi.mock("server-only", () => ({}));
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

    async createThread(
      investigationId: InvestigationId,
      threadId: string,
      title: string,
      occurredAt?: string,
    ): Promise<CopilotConversationThread> {
      const now = occurredAt ?? new Date().toISOString();
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
    ): Promise<CopilotConversationThread> {
      const now = occurredAt ?? new Date().toISOString();
      const userMessage: CopilotUserMessage = {
        role: "user",
        content: message,
        at: now,
        snapshotRevision,
        ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
      };
      return {
        investigationId,
        threadId,
        title: message.slice(0, 160),
        threadRevision: 1,
        createdAt: now,
        updatedAt: now,
        messages: [userMessage],
      };
    }

    async appendTurn(
      investigationId: InvestigationId,
      threadId: string,
      _expectedThreadRevision: number,
      userMessage: string,
      assistantTurn: Omit<CopilotAssistantMessage, "role">,
      nextConversationState?: ConversationState | null,
    ): Promise<CopilotConversationThread> {
      const now = assistantTurn.at;
      return {
        investigationId,
        threadId,
        title: userMessage.slice(0, 160),
        threadRevision: 2,
        createdAt: now,
        updatedAt: now,
        ...(nextConversationState ? { conversationState: nextConversationState } : {}),
        messages: [
          {
            role: "user",
            content: userMessage,
            at: now,
            snapshotRevision: assistantTurn.snapshotRevision,
            ...(assistantTurn.idempotencyKey !== undefined
              ? { idempotencyKey: assistantTurn.idempotencyKey }
              : {}),
          },
          { role: "assistant" as const, ...assistantTurn },
        ],
      };
    }
  },
}));
vi.mock("../context-builder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../context-builder")>();
  return {
    ...actual,
    buildInvestigationContext: (...args: Parameters<typeof actual.buildInvestigationContext>) => {
      const packet = actual.buildInvestigationContext(...args);
      mocks.contextPackets.push(packet);
      return packet;
    },
  };
});

import { executeCopilotTurn } from "../execute-copilot-turn";

const liveValidationEnabled =
  process.env.RUN_LIVE_PROVIDER_VALIDATION === "true" &&
  process.env.AZURE_OPENAI_LIVE_CALLS_ENABLED === "true";
const liveIt = liveValidationEnabled ? it : it.skip;
const canonical = buildSprint1A5GoldenInvestigation();
const snapshot = buildSprint1A5Snapshot(canonical);
const originalFetch = globalThis.fetch.bind(globalThis);
const citationIdPattern = /^cite:evidence:/;

const cases = [
  {
    id: "M1",
    question: "Which applications are involved in this investigation and how are they connected?",
  },
  {
    id: "M2",
    question: "What operational consequence follows from this Windchill part being represented as a SAP material?",
  },
] as const;

function parseRawJson(content: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    try {
      const unfenced = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      return JSON.parse(unfenced) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
}

function promptPayloadFrom(call: { requestBody: Record<string, unknown> }): Record<string, unknown> {
  const messages = call.requestBody.messages as Array<{ role: string; content: string }>;
  const userMessage = messages.filter((message) => message.role === "user").at(-1);
  if (!userMessage) throw new Error("Provider request did not contain a user prompt.");
  return JSON.parse(userMessage.content) as Record<string, unknown>;
}

function redactProviderText(value: string): string {
  const apiKey = process.env.AZURE_OPENAI_API_KEY?.trim();
  return value
    .replace(apiKey ? new RegExp(apiKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g") : /$^/, "[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/(api[-_ ]?key|authorization|access[_ -]?token|password|secret)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1$2[REDACTED]");
}

beforeEach(() => {
  mocks.contextPackets.length = 0;
  mocks.providerCalls.length = 0;
  mocks.loadSnapshot.mockReset().mockResolvedValue(snapshot as InvestigationSnapshot);
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (process.env.RUN_PROVIDER_AUTH_DIAGNOSTIC === "true" && mocks.providerCalls.length > 0) {
      throw new Error("Provider auth diagnostic permits exactly one outbound request.");
    }

    const requestUrl = new URL(String(input));
    const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const requestHeaders = new Headers(init?.headers);
    const response = await originalFetch(input, init);
    const responseText = await response.clone().text().catch(() => "");
    const responseBody = (() => {
      try {
        return JSON.parse(responseText) as Record<string, unknown>;
      } catch {
        return undefined;
      }
    })();
    const providerError = responseBody?.error && typeof responseBody.error === "object"
      ? responseBody.error as Record<string, unknown>
      : undefined;
    const choices = responseBody?.choices;
    const firstChoice = Array.isArray(choices) && choices[0] && typeof choices[0] === "object"
      ? choices[0] as Record<string, unknown>
      : undefined;
    const message = firstChoice?.message && typeof firstChoice.message === "object"
      ? firstChoice.message as Record<string, unknown>
      : undefined;
    const responseHeaders = Object.fromEntries(
      ["content-type", "date", "x-request-id", "apim-request-id", "x-ms-region", "x-ms-error-code", "www-authenticate"]
        .flatMap((name) => {
          const value = response.headers.get(name);
          return value ? [[name, redactProviderText(value)]] : [];
        }),
    );
    const endpointHostLabel = requestUrl.hostname.split(".")[0] ?? requestUrl.hostname;
    const endpointHost = requestUrl.hostname.includes(".")
      ? `${endpointHostLabel.slice(0, 3)}[redacted]${requestUrl.hostname.slice(endpointHostLabel.length)}`
      : "[redacted]";
    const deployment = requestUrl.pathname.match(/\/openai\/deployments\/([^/]+)/)?.[1];
    const providerErrorCode = typeof providerError?.code === "string"
      ? redactProviderText(providerError.code)
      : undefined;
    const providerErrorMessage = typeof providerError?.message === "string"
      ? redactProviderText(providerError.message)
      : undefined;
    const content = message?.content;
    const usage = responseBody?.usage && typeof responseBody.usage === "object"
      ? responseBody.usage as Record<string, unknown>
      : undefined;

    const providerCall = {
      requestBody,
      status: response.status,
      endpointHost,
      requestPath: `${requestUrl.pathname}${requestUrl.search}`,
      ...(deployment ? { deployment: decodeURIComponent(deployment) } : {}),
      ...(requestUrl.searchParams.has("api-version") ? { apiVersion: requestUrl.searchParams.get("api-version")! } : {}),
      authMode: requestHeaders.has("api-key") ? "Azure API key header present (value redacted)" : "API key header missing",
      responseHeaders,
      ...(providerErrorCode ? { providerErrorCode } : {}),
      ...(providerErrorMessage ? { providerErrorMessage } : {}),
      ...(typeof content === "string" ? { rawAnswer: content } : {}),
      ...(usage ? {
        usage: Object.fromEntries(
          Object.entries(usage).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
        ),
      } : {}),
    };
    mocks.providerCalls.push(providerCall);
    if (process.env.RUN_PROVIDER_AUTH_DIAGNOSTIC === "true") {
      console.info("PROVIDER_AUTH_DIAGNOSTIC", JSON.stringify({
        status: providerCall.status,
        endpointHost: providerCall.endpointHost,
        deployment: providerCall.deployment,
        apiVersion: providerCall.apiVersion,
        requestPath: providerCall.requestPath,
        authMode: providerCall.authMode,
        responseHeaders: providerCall.responseHeaders,
        providerErrorCode: providerCall.providerErrorCode,
        providerErrorMessage: providerCall.providerErrorMessage,
      }));
    }
    return response;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Sprint 1A.6 opt-in provider-backed golden-fixture validation", () => {
  it("does not make live provider calls without the explicit per-command opt-in", () => {
    if (liveValidationEnabled) return;
    expect(mocks.providerCalls).toHaveLength(0);
  });

  liveIt.each(cases)("validates provider answer for $id", async ({ id, question }) => {
    const outcome = await executeCopilotTurn({
      investigationId: snapshot.identity.investigationId,
      expectedSnapshotRevision: snapshot.identity.revision,
      idempotencyKey: `sprint-1a6-${id}`,
      threadId: `sprint-1a6-${id.toLocaleLowerCase()}`,
      createIfMissing: true,
      message: question,
    });

    const providerCall = mocks.providerCalls.at(-1);
    const packet = mocks.contextPackets.at(-1) as {
      questionIntent: string;
      ambiguity: { clarificationRequired: boolean };
      knowledgeGraphSummary?: unknown;
      reasoningPackage: {
        relationshipNarratives: readonly { id: string; text: string; relationshipIds: readonly string[]; citationIds: readonly string[] }[];
        impactNarratives: readonly { id: string; text: string; relationshipIds: readonly string[]; citationIds: readonly string[] }[];
        impactChains: readonly { id: string; relationshipIds: readonly string[]; citationIds: readonly string[] }[];
      };
      engineeringBrief: {
        majorRelationships: readonly { relationshipId: string; kind: string; evidenceCitationIds: readonly string[] }[];
        relationshipNarratives: readonly { id: string }[];
        impactNarratives: readonly { id: string }[];
        topImpactChains: readonly { id: string }[];
        relationshipEvidence: readonly { evidenceId: string; citationId: string }[];
      };
      citations: readonly { citationId: string }[];
      omissions: { categories: readonly string[]; omittedCounts: Readonly<Record<string, number>> };
    };
    const prompt = providerCall ? promptPayloadFrom(providerCall) : undefined;
    const promptBrief = prompt?.engineeringBrief as Record<string, unknown> | undefined;
    const promptRelationships = (promptBrief?.majorRelationships ?? []) as Array<{ relationshipId: string; kind: string; evidenceCitationIds: string[] }>;
    const promptRelationshipNarratives = (promptBrief?.relationshipNarratives ?? []) as Array<{ id: string }>;
    const promptImpactNarratives = (promptBrief?.impactNarratives ?? []) as Array<{ id: string }>;
    const promptImpactChains = (prompt?.topImpactChains ?? []) as Array<{ id: string }>;
    const promptEvidence = (promptBrief?.relationshipEvidence ?? []) as Array<{ evidenceId: string; citationId: string }>;
    const rawAnswer = providerCall?.rawAnswer;
    const rawJson = rawAnswer ? parseRawJson(rawAnswer) : undefined;
    const rawAnswerText = typeof rawJson?.answer === "string" ? rawJson.answer : "";
    const finalAnswer = outcome.ok ? outcome.answer : undefined;
    const lowerRawAnswer = rawAnswerText.toLocaleLowerCase();
    const lowerFinalAnswer = finalAnswer?.answer.toLocaleLowerCase() ?? "";

    console.info("SPRINT_1A6_CAPTURE", JSON.stringify({
      benchmark: id,
      question,
      graph: {
        canonicalRelationships: canonical.relationships.map((relationship) => ({
          id: relationship.id,
          kind: relationship.kind,
          sourceEntityId: relationship.sourceEntityId,
          targetEntityId: relationship.targetEntityId,
          evidenceIds: relationship.evidenceIds,
        })),
        resolvedRelationships: canonical.knowledgeGraph?.resolvedRelationships.map((relationship) => ({
          id: relationship.id,
          canonicalRelationshipIds: relationship.canonicalRelationshipIds,
          definitionId: relationship.definitionId,
          type: relationship.forwardType,
        })),
        impactPaths: canonical.knowledgeGraph?.impactPaths.map((path) => ({
          id: path.id,
          sourceEntityId: path.sourceEntityId,
          targetEntityId: path.targetEntityId,
          relationshipIds: path.relationshipIds,
          citationIds: path.citationIds,
        })),
        impactChains: canonical.knowledgeGraph?.impactChains?.map((chain) => ({
          id: chain.id,
          sourceEntityId: chain.sourceEntityId,
          impactedEntityId: chain.impactedEntityId,
          relationshipIds: chain.relationshipIds,
          citationIds: chain.citationIds,
        })),
      },
      context: packet ? {
        questionIntent: packet.questionIntent,
        clarificationRequired: packet.ambiguity.clarificationRequired,
        relationshipNarratives: packet.reasoningPackage.relationshipNarratives,
        impactNarratives: packet.reasoningPackage.impactNarratives,
        impactChains: packet.reasoningPackage.impactChains,
        engineeringBrief: packet.engineeringBrief,
        citations: packet.citations,
        omissions: packet.omissions,
      } : undefined,
      prompt: {
        majorRelationships: promptRelationships,
        relationshipNarratives: promptRelationshipNarratives,
        impactNarratives: promptImpactNarratives,
        impactChains: promptImpactChains,
        relationshipEvidence: promptEvidence,
      },
      provider: providerCall ? {
        status: providerCall.status,
        usage: providerCall.usage,
        rawAnswer,
      } : undefined,
      validatedAnswer: finalAnswer,
      answerTextChangedByValidation: rawJson && finalAnswer
        ? rawAnswerText !== finalAnswer.answer
        : undefined,
      outcome: outcome.ok ? "success" : outcome.body,
    }));

    expect(mocks.providerCalls.length, `${id}: provider was not called`).toBeGreaterThan(0);
    expect(providerCall?.status, `${id}: provider HTTP status`).toBe(200);
    expect(rawAnswer, `${id}: raw provider answer`).toBeTruthy();
    expect(packet!.ambiguity.clarificationRequired, `${id}: no entity clarification`).toBe(false);
    expect(packet!.reasoningPackage.relationshipNarratives.length).toBeGreaterThan(0);
    expect(packet!.reasoningPackage.impactNarratives.length).toBeGreaterThan(0);
    expect(packet!.reasoningPackage.impactChains.length).toBeGreaterThan(0);
    expect(promptRelationships.length).toBeGreaterThan(0);
    expect(promptRelationshipNarratives.length).toBeGreaterThan(0);
    expect(promptImpactNarratives.length).toBeGreaterThan(0);
    expect(promptImpactChains.length).toBeGreaterThan(0);
    expect(promptEvidence.length).toBeGreaterThan(0);
    expect(outcome.ok, `${id}: validated provider answer`).toBe(true);

    if (!rawJson || !finalAnswer) return;
    if (id === "M1") {
      for (const application of ["windchill", "sap", "configit", "codebeamer"]) {
        expect(lowerRawAnswer, `raw M1 answer includes ${application}`).toContain(application);
        expect(lowerFinalAnswer, `final M1 answer includes ${application}`).toContain(application);
      }
      for (const relationship of ["operationally-represented-as", "configured-by", "specified-by"]) {
        expect(lowerRawAnswer, `raw M1 answer includes ${relationship}`).toContain(relationship);
        expect(lowerFinalAnswer, `final M1 answer includes ${relationship}`).toContain(relationship);
      }
      expect(new Set(promptRelationships.map((relationship) => relationship.kind))).toEqual(new Set([
        "operationally-represented-as",
        "configured-by",
        "specified-by",
      ]));
      expect((rawJson.followUpQuestions as unknown[] | undefined) ?? []).toHaveLength(0);
      expect(lowerRawAnswer).not.toMatch(/please (clarify|identify|specify)|which .* did you mean/i);
    } else {
      expect(lowerRawAnswer).toContain("operationally-represented-as");
      expect(lowerRawAnswer).toMatch(/potential impact|may require|does not establish causation|not proof of causation/i);
      const evidenceCitationIds = new Set(promptEvidence.map((item) => item.citationId));
      const rawClaimCitationIds = ((rawJson.claims as Array<{ citationIds?: unknown }> | undefined) ?? [])
        .flatMap((claim) => Array.isArray(claim.citationIds) ? claim.citationIds.filter((id): id is string => typeof id === "string") : []);
      expect(rawClaimCitationIds.some((citationId) => citationIdPattern.test(citationId) && evidenceCitationIds.has(citationId))).toBe(true);
      expect(finalAnswer.answer.toLocaleLowerCase()).toMatch(/potential impact|may require|does not establish causation|not proof of causation/i);
      expect(finalAnswer.answer).not.toMatch(/cite:evidence:/i);
      expect(finalAnswer.citations?.some((citation) => citation.kind === "evidence")).toBe(true);
    }

    expect(JSON.stringify(providerCall?.requestBody)).not.toContain(process.env.AZURE_OPENAI_API_KEY ?? "__no_api_key__");
  });
});
