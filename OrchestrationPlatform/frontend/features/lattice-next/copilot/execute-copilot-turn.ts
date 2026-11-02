import "server-only";

import { randomUUID } from "node:crypto";
import type { InvestigationId } from "../kernel/contracts/investigation-identity";
import { serverKernel } from "../kernel/server/server-kernel-runtime";
import { FileCopilotConversationStore } from "../kernel/server/file-copilot-conversation-store";
import type { CopilotConversationMessage } from "../kernel/ports/copilot-conversation-store";
import type { InvestigationSnapshot } from "../kernel/contracts/investigation-snapshot";
import type { CopilotAnswer, CopilotContextPacket } from "./contracts";
import { CopilotAnswerValidationError, validateCopilotAnswer } from "./answer-validator";
import {
  buildInvestigationContext,
  engineeringPromptPayload,
  ensureEngineeringAnswerCoverage,
} from "./context-builder";
import { ensureInvestigationKnowledgeGraph } from "../plm-brain/universal/ensure-investigation-knowledge-graph";
import { completeCopilotTurn, type AzureChatRequest } from "./azure-openai-client";
import { COPILOT_POLICY_VERSION, COPILOT_SYSTEM_POLICY } from "./policy";

const MAX_HISTORY_MESSAGES = 12;
const MAX_THREAD_LIST = 50;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 10;
const AZURE_FAILURE_CODES = new Set(["invalid-configuration", "timeout", "network-error", "provider-http-error", "invalid-provider-response", "usage-ledger-error"]);
const store = new FileCopilotConversationStore();
const requestTimes = new Map<string, number[]>();

export interface CopilotTurnCommand {
  investigationId: InvestigationId;
  expectedSnapshotRevision: number;
  idempotencyKey: string;
  message: string;
  threadId?: string;
  expectedThreadRevision?: number;
  createIfMissing?: boolean;
  signal?: AbortSignal;
}

export interface CopilotTurnSuccess {
  ok: true;
  investigationId: InvestigationId;
  threadId: string;
  threadRevision: number;
  snapshotRevision: number;
  answer: CopilotAnswer;
  idempotentReplay: boolean;
}

export interface CopilotTurnFailure {
  ok: false;
  status: number;
  body: Record<string, unknown>;
}

export type CopilotTurnOutcome = CopilotTurnSuccess | CopilotTurnFailure;

function failure(status: number, message: string, extra: Record<string, unknown> = {}): CopilotTurnFailure {
  return { ok: false, status, body: { message, ...extra } };
}

function consumeRateLimit(investigationId: string, now = Date.now()): boolean {
  const recent = (requestTimes.get(investigationId) ?? []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_REQUESTS) {
    requestTimes.set(investigationId, recent);
    return false;
  }
  requestTimes.set(investigationId, [...recent, now]);
  return true;
}

function parseModelAnswer(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    const unfenced = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const start = unfenced.indexOf("{");
    if (start < 0) throw new Error("malformed-json");
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let index = start; index < unfenced.length; index += 1) {
      const character = unfenced[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === "\"") inString = false;
        continue;
      }

      if (character === "\"") {
        inString = true;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      }

    }
    if (end < 0 || unfenced.slice(end + 1).trim().includes("{")) throw new Error("malformed-json");
    try {
      return JSON.parse(unfenced.slice(start, end + 1)) as unknown;
    } catch {
      throw new Error("malformed-json");
    }
  }
}

function repairProviderAnswer(value: unknown, context: CopilotContextPacket): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const answer = value as Record<string, unknown>;
  if (typeof answer.answer !== "string" || !answer.answer.trim()) return value;
  const knownCitationIds = new Set(context.citations.map((citation) => citation.citationId));
  const claims = (Array.isArray(answer.claims) ? answer.claims : []).flatMap((claim) => {
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) return [];
    const item = claim as Record<string, unknown>;
    if (typeof item.text !== "string" || !item.text.trim()) return [];
    const kind = item.kind === "fact" || item.kind === "hypothesis" ? item.kind : "hypothesis";
    const citationIds = Array.isArray(item.citationIds)
      ? [...new Set(item.citationIds.filter((id): id is string => typeof id === "string" && knownCitationIds.has(id)))]
      : [];
    return [{ text: item.text, kind: citationIds.length || kind === "hypothesis" ? kind : "hypothesis", citationIds }];
  });
  const recommendations = (Array.isArray(answer.recommendations) ? answer.recommendations : []).flatMap((recommendation) => {
    if (!recommendation || typeof recommendation !== "object" || Array.isArray(recommendation)) return [];
    const item = recommendation as Record<string, unknown>;
    if (item.approvalRequired !== true || typeof item.text !== "string" || typeof item.rationale !== "string") return [];
    const citationIds = Array.isArray(item.citationIds)
      ? [...new Set(item.citationIds.filter((id): id is string => typeof id === "string" && knownCitationIds.has(id)))]
      : [];
    return citationIds.length ? [{ text: item.text, rationale: item.rationale, citationIds, approvalRequired: true as const }] : [];
  });
  return {
    ...answer,
    claims,
    recommendations,
    uncertainties: Array.isArray(answer.uncertainties) ? answer.uncertainties.filter((item): item is string => typeof item === "string") : [],
    followUpQuestions: Array.isArray(answer.followUpQuestions) ? answer.followUpQuestions.filter((item): item is string => typeof item === "string") : [],
    snapshotRevision: context.snapshotRevision,
  };
}

function conversationMessages(messages: readonly CopilotConversationMessage[]) {
  return messages.slice(-MAX_HISTORY_MESSAGES).map((message) => ({
    role: message.role,
    content: message.role === "user" ? message.content : JSON.stringify(message.answer),
  }));
}

const answerFormat = (snapshotRevision: number, questionIntent: CopilotContextPacket["questionIntent"]) => `Return exactly one JSON object without code fences:
{"answer":"string","claims":[{"text":"string","kind":"fact|hypothesis","citationIds":["citation-id"]}],"recommendations":[{"text":"string","rationale":"string","citationIds":["citation-id"],"approvalRequired":true}],"uncertainties":["string"],"followUpQuestions":["string"],"snapshotRevision":${snapshotRevision}}
Use primaryEntities, majorRelationships, relationshipNarratives, impactNarratives, engineeringInsights, topImpactChains, relationshipEvidence, and strongestEvidence from the engineering brief before supportingContext. When these relationship artifacts are present, explicitly explain the major governed relationships and potential impact links; do not omit them in favor of listing entity attributes. When relationship provenance, status, strength, or supporting evidence is supplied, summarize the relevant basis and cite the evidence. For an investigation-summary or primary-entities question, identify entities by name, type, and application, then describe cross-application and impact relationships with their supplied explanations. Do not dump field-level properties, accounting fields, or metadata unless specifically requested. Treat supportingContext as corroborating detail and consult it only when needed. Write a concise engineering response with Evidence, Relationships, Analysis, and Conclusion sections when relevant; include impact chains and missing evidence when material. Lead with the supported engineering consequence. Use kind=fact only for claims directly established by the active investigation snapshot and cite each fact; use kind=hypothesis for interpretation and disclose uncertainty. The supplied paths are already traversed by Lattice: explain them, but do not invent or infer new relationships. Relationship definitions describe semantics and do not prove an instance exists. A MAY_IMPACT path indicates potential impact, not causation. An empty or omitted path set is not proof that no relationship or impact exists. If entity ambiguity is provided, disclose the strongest candidate and alternatives; if clarificationRequired is true, do not make entity-specific claims and ask the supplied follow-up question. Every recommendation must cite supporting IDs and require approval. Do not include raw citation IDs in answer text.
${questionIntent === "summary" ? "This is an investigation-summary question: include the primary entities and at least one available major relationship, relationship narrative, or impact chain. " : ""}`;

async function loadSnapshot(investigationId: InvestigationId): Promise<InvestigationSnapshot | undefined> {
  return serverKernel.load(investigationId);
}

async function loadThreads(investigationId: InvestigationId) {
  return store.listThreads(investigationId, MAX_THREAD_LIST);
}

export async function executeCopilotTurn(command: CopilotTurnCommand): Promise<CopilotTurnOutcome> {
  const {
    investigationId,
    expectedSnapshotRevision,
    idempotencyKey,
    message,
    signal,
  } = command;
  if (!message.trim() || message.length > 2_000 || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(idempotencyKey))
    return failure(400, "Copilot message or request identifier is invalid.");

  const snapshot = await loadSnapshot(investigationId);
  if (!snapshot) return failure(404, "Investigation was not found.");
  if (snapshot.archivedAt) return failure(409, "Restore the investigation before adding copilot messages.");
  if (snapshot.identity.revision !== expectedSnapshotRevision)
    return failure(409, "The investigation changed before the message could be saved.", { revision: snapshot.identity.revision });

  let contextSnapshot: InvestigationSnapshot;
  try {
    contextSnapshot = ensureInvestigationKnowledgeGraph(snapshot);
  } catch {
    return failure(503, "The authoritative relationship ontology is unavailable. Copilot cannot safely answer this request.");
  }

  let threadId = command.threadId ?? randomUUID();
  let existingThread = command.threadId ? await store.loadThread(investigationId, threadId) : undefined;
  if (command.threadId && !existingThread && !command.createIfMissing)
    return failure(404, "Copilot thread was not found.");
  if (!command.threadId) {
    const summaries = await loadThreads(investigationId);
    for (const summary of summaries) {
      const candidate = await store.loadThread(investigationId, summary.threadId);
      if (candidate?.messages.some((entry) => entry.idempotencyKey === idempotencyKey)) {
        threadId = summary.threadId;
        existingThread = candidate;
        break;
      }
    }
  }

  const previousAssistant = existingThread?.messages.find((entry) => entry.role === "assistant" && entry.idempotencyKey === idempotencyKey);
  if (previousAssistant?.role === "assistant") {
    if (previousAssistant.snapshotRevision !== snapshot.identity.revision)
      return failure(409, "The idempotent answer belongs to a different snapshot revision.");
    return {
      ok: true,
      investigationId,
      threadId,
      threadRevision: existingThread!.threadRevision,
      snapshotRevision: previousAssistant.snapshotRevision,
      answer: previousAssistant.answer,
      idempotentReplay: true,
    };
  }

  if (!consumeRateLimit(String(investigationId)))
    return failure(429, "Copilot request rate limit reached. Please retry later.");

  if (!existingThread) {
    existingThread = await store.createThread(investigationId, threadId, message.slice(0, 160));
  }
  const lastMessage = existingThread.messages.at(-1);
  const retryingPendingMessage = lastMessage?.role === "user" &&
    lastMessage.idempotencyKey === idempotencyKey &&
    lastMessage.content === message &&
    lastMessage.snapshotRevision === snapshot.identity.revision;
  const requestedThreadRevision = command.expectedThreadRevision ?? existingThread.threadRevision;
  if (existingThread.threadRevision !== requestedThreadRevision &&
      !(retryingPendingMessage && existingThread.threadRevision === requestedThreadRevision + 1))
    return failure(409, "Copilot thread revision changed before this request.");
  const expectedThreadRevision = retryingPendingMessage ? existingThread.threadRevision : requestedThreadRevision;

  const stagedThread = await store.appendUserMessage(
    investigationId,
    threadId,
    expectedThreadRevision,
    message,
    snapshot.identity.revision,
    new Date().toISOString(),
    idempotencyKey,
  );
  const contextPacket: CopilotContextPacket = buildInvestigationContext(contextSnapshot, message);
  const existingMessages = existingThread.messages.at(-1)?.role === "user" && existingThread.messages.at(-1)?.idempotencyKey === idempotencyKey
    ? existingThread.messages.slice(0, -1)
    : existingThread.messages;
  const history = conversationMessages(existingMessages);

  if (contextPacket.ambiguity.clarificationRequired) {
    const candidates = contextPacket.entityCandidates.slice(0, 5);
    const explicitTie = candidates.length > 1 &&
      candidates[0].score === candidates[1].score &&
      (candidates[0].matchBasis === "exact-identifier" || candidates[0].matchBasis === "governed-property");
    const candidateLines = candidates.map((candidate) =>
      `- ${candidate.label}${candidate.source ? ` (${candidate.source})` : ""}${candidate.nativeId ? ` · ${candidate.nativeId}` : ""} — match score ${candidate.score.toFixed(2)}`,
    );
    const answer: CopilotAnswer = {
      answer: [
        "I found possible entities in this investigation, but none matched strongly enough to make a reliable entity-specific analysis.",
        ...(candidateLines.length ? ["Possible matches:", ...candidateLines] : ["No matching entity was found in the active investigation snapshot."]),
        explicitTie
          ? "I found multiple entities that match the identifier/property provided. Please select which entity you intended."
          : "Please identify the intended entity, or provide its exact source identifier. I’ll continue using only this investigation’s saved evidence.",
      ].join("\n\n"),
      claims: candidates.map((candidate) => ({
        text: `The active investigation contains the candidate ${candidate.label}${candidate.source ? ` in ${candidate.source}` : ""}${candidate.nativeId ? ` with identifier ${candidate.nativeId}` : ""}.`,
        kind: "fact" as const,
        citationIds: [candidate.citationId],
      })),
      recommendations: [],
      uncertainties: contextPacket.uncertainties,
      followUpQuestions: ["Which listed entity did you mean, or what exact source identifier should I use?"],
      snapshotRevision: contextPacket.snapshotRevision,
    };
    const validatedAnswer = validateCopilotAnswer(answer, contextPacket);
    const completed = await store.appendTurn(investigationId, threadId, stagedThread.threadRevision, message, {
      answer: validatedAnswer,
      at: new Date().toISOString(),
      snapshotRevision: snapshot.identity.revision,
      idempotencyKey,
    });
    const assistant = completed.messages.at(-1);
    if (!assistant || assistant.role !== "assistant")
      return failure(503, "Clarification response was not persisted. Do not retry automatically.");
    return {
      ok: true,
      investigationId,
      threadId,
      threadRevision: completed.threadRevision,
      snapshotRevision: snapshot.identity.revision,
      answer: assistant.answer,
      idempotentReplay: false,
    };
  }

  if (contextPacket.retrievalConfidence.belowThreshold) {
    const reasoning = contextPacket.reasoningPackage;
    const evidence = reasoning.strongestEvidence.slice(0, 5);
    const relationshipNarratives = reasoning.relationshipNarratives.slice(0, 5);
    const impactNarratives = reasoning.impactNarratives.slice(0, 5);
    const missingEvidence = reasoning.missingEvidence.slice(0, 5);
    const answer: CopilotAnswer = {
      answer: [
        "Evidence",
        ...(evidence.length
          ? evidence.map((item) => `- ${item.summary}`)
          : ["- No supporting evidence was found in the active investigation snapshot."]),
        "",
        "Relationships",
        ...(relationshipNarratives.length
          ? relationshipNarratives.map((item) => `- ${item.text}`)
          : ["- No relevant governed relationship was retrieved for this question."]),
        "",
        "Potential impact chains",
        ...(impactNarratives.length
          ? impactNarratives.map((item) => `- ${item.text}`)
          : ["- No ontology-eligible impact chain was available in the active snapshot."]),
        "",
        "Missing evidence",
        ...(missingEvidence.length
          ? missingEvidence.map((item) => `- ${item.description}`)
          : ["- The retrieved evidence is insufficient to establish a stronger engineering conclusion."]),
        "",
        "Analysis",
        contextPacket.grounding.partialSources.length
          ? `Source coverage is partial for ${contextPacket.grounding.partialSources.join(", ")}.`
          : "The available snapshot does not provide enough independently supporting evidence.",
        "",
        "Conclusion",
        "I can’t establish a reliable engineering conclusion from the evidence currently available. The findings above describe what was retrieved, not proof that no other impact or dependency exists.",
      ].join("\n"),
      claims: [
        ...evidence.map((item) => ({
          text: item.summary,
          kind: "fact" as const,
          citationIds: [item.citationId],
        })),
        ...relationshipNarratives.map((item) => ({
          text: item.text,
          kind: item.relationshipIds.length > 1 ? "hypothesis" as const : "fact" as const,
          citationIds: item.citationIds,
        })),
        ...impactNarratives.map((item) => ({
          text: item.text,
          kind: "hypothesis" as const,
          citationIds: item.citationIds,
        })),
        ...missingEvidence.map((item) => ({
          text: item.description,
          kind: "hypothesis" as const,
          citationIds: item.citationIds,
        })),
      ],
      recommendations: [],
      uncertainties: [
        ...contextPacket.uncertainties,
        "The retrieval confidence score is a heuristic signal, not a calibrated probability.",
      ],
      followUpQuestions: [
        contextPacket.grounding.partialSources.length
          ? `Can the investigation include or refresh evidence from ${contextPacket.grounding.partialSources.join(", ")}?`
          : "Can you provide or add the source record that supports the engineering relationship or impact being investigated?",
      ],
      snapshotRevision: contextPacket.snapshotRevision,
    };
    const preparedAnswer = ensureEngineeringAnswerCoverage(
      answer,
      contextPacket.engineeringBrief,
      contextPacket.citations,
      contextPacket.questionIntent === "summary",
    );
    const validatedAnswer = validateCopilotAnswer(preparedAnswer, contextPacket);
    const completed = await store.appendTurn(investigationId, threadId, stagedThread.threadRevision, message, {
      answer: validatedAnswer,
      at: new Date().toISOString(),
      snapshotRevision: snapshot.identity.revision,
      idempotencyKey,
    });
    const assistant = completed.messages.at(-1);
    if (!assistant || assistant.role !== "assistant")
      return failure(503, "Low-confidence response was not persisted. Do not retry automatically.");
    return {
      ok: true,
      investigationId,
      threadId,
      threadRevision: completed.threadRevision,
      snapshotRevision: snapshot.identity.revision,
      answer: assistant.answer,
      idempotentReplay: false,
    };
  }

  let providerResponse;
  try {
    const request: AzureChatRequest = {
      requestId: idempotencyKey,
      messages: [
        { role: "system", content: `${COPILOT_SYSTEM_POLICY}\nPolicy version: ${COPILOT_POLICY_VERSION}\n${answerFormat(contextPacket.snapshotRevision, contextPacket.questionIntent)}` },
        ...history,
        { role: "user", content: JSON.stringify(engineeringPromptPayload(message, contextPacket)) },
      ],
      maxTokens: 2_000,
      temperature: 0.1,
      ...(signal ? { signal } : {}),
    };
    providerResponse = await completeCopilotTurn(request);
  } catch (cause) {
    const errorValue = cause && typeof cause === "object" ? cause as { code?: unknown; status?: unknown } : undefined;
    const failureCode = typeof errorValue?.code === "string" && AZURE_FAILURE_CODES.has(errorValue.code) ? errorValue.code : "unknown-provider-error";
    const providerStatus = typeof errorValue?.status === "number" ? errorValue.status : undefined;
    const ambiguousBilling = ["network-error", "timeout", "usage-ledger-error", "invalid-provider-response", "unknown-provider-error"].includes(failureCode);
    const retryableStatus = providerStatus === 429 || providerStatus === 500 || providerStatus === 502 || providerStatus === 503 || providerStatus === 504;
    return failure(502, ambiguousBilling
      ? "Copilot request failed ambiguously and may have been billed. Do not retry automatically; check the usage ledger first."
      : "Copilot provider rejected the request. The user message is retained; retry only after reviewing the provider status.", {
      failureCode,
      ...(providerStatus !== undefined ? { providerStatus } : {}),
      retryable: !ambiguousBilling && retryableStatus,
      requestMayHaveBeenBilled: ambiguousBilling,
      investigationId,
      threadId,
      threadRevision: stagedThread.threadRevision,
      idempotencyKey,
    });
  }

  let validatedAnswer: CopilotAnswer;
  try {
    const parsedAnswer = parseModelAnswer(providerResponse.content);
    const repairedAnswer = repairProviderAnswer(parsedAnswer, contextPacket);
    const modelAnswer = ensureEngineeringAnswerCoverage(
      repairedAnswer,
      contextPacket.engineeringBrief,
      contextPacket.citations,
      contextPacket.questionIntent === "summary",
    );
    validatedAnswer = validateCopilotAnswer(modelAnswer, contextPacket);
  } catch (cause) {
    const category = cause instanceof CopilotAnswerValidationError
      ? "schema-validation"
      : cause instanceof Error && cause.message === "malformed-json"
        ? "malformed-json"
        : "response-shape";
    console.error("[copilot] provider validation failure", {
      category,
      investigationId,
      threadId,
      snapshotRevision: contextPacket.snapshotRevision,
      rawProviderPayload: providerResponse.content,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return failure(502, "Copilot returned an answer that could not be validated. No assistant turn was saved.", {
      validationIssue: `Provider response failed ${category}.`,
      validationCategory: category,
      investigationId,
      threadId,
      threadRevision: stagedThread.threadRevision,
      idempotencyKey,
      retryable: true,
      requestMayHaveBeenBilled: true,
    });
  }

  const completed = await store.appendTurn(investigationId, threadId, stagedThread.threadRevision, message, {
    answer: validatedAnswer,
    at: new Date().toISOString(),
    snapshotRevision: snapshot.identity.revision,
    idempotencyKey,
  });
  const assistant = completed.messages.at(-1);
  if (!assistant || assistant.role !== "assistant")
    return failure(503, "Validated assistant turn was not persisted. Do not retry automatically.");
  return {
    ok: true,
    investigationId,
    threadId,
    threadRevision: completed.threadRevision,
    snapshotRevision: snapshot.identity.revision,
    answer: assistant.answer,
    idempotentReplay: false,
  };
}