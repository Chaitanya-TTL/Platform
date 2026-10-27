import "server-only";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { InvestigationId } from "../kernel/contracts/investigation-identity";
import { serverKernel } from "../kernel/server/server-kernel-runtime";
import { FileCopilotConversationStore } from "../kernel/server/file-copilot-conversation-store";
import type { CopilotConversationMessage, CopilotConversationStore } from "../kernel/ports/copilot-conversation-store";
import type { InvestigationSnapshot } from "../kernel/contracts/investigation-snapshot";
import type { CopilotAnswer, CopilotContextPacket } from "./contracts";
import { CopilotAnswerValidationError, validateCopilotAnswer } from "./answer-validator";
import { buildInvestigationContext } from "./context-builder";
import { parseRelationshipGuidance } from "./relationship-guidance";
import { completeCopilotTurn, type AzureChatRequest } from "./azure-openai-client";
import { COPILOT_POLICY_VERSION, COPILOT_SYSTEM_POLICY } from "./policy";

const MAX_HISTORY_MESSAGES = 12;
const MAX_THREAD_LIST = 50;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 10;
const AZURE_FAILURE_CODES = new Set(["invalid-configuration", "timeout", "network-error", "provider-http-error", "invalid-provider-response", "usage-ledger-error"]);
const store = new FileCopilotConversationStore();
const requestTimes = new Map<string, number[]>();
const relationshipDocumentPath = resolve(process.cwd(), "..", "docs", "relationships.md");

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
    throw new Error("Azure response was not valid JSON.");
  }
}

function conversationMessages(messages: readonly CopilotConversationMessage[]) {
  return messages.slice(-MAX_HISTORY_MESSAGES).map((message) => ({
    role: message.role,
    content: message.role === "user" ? message.content : JSON.stringify(message.answer),
  }));
}

const answerFormat = (snapshotRevision: number) => `Return exactly one JSON object and no markdown:
{"answer":"string","claims":[{"text":"string","kind":"fact|hypothesis","citationIds":["citation-id"]}],"recommendations":[{"text":"string","rationale":"string","citationIds":["citation-id"],"approvalRequired":true}],"uncertainties":["string"],"followUpQuestions":["string"],"snapshotRevision":${snapshotRevision}}
Lead with the relevant engineering consequence and why it matters when the supplied evidence supports one. Explain the evidence and uncertainty needed to make the synthesis clear; be concise without a fixed sentence or claim count. Do not enumerate unrelated records, repeat claim details, or include raw citation IDs in answer text. Use kind=fact only for claims directly established by investigation context and cite each fact. Use kind=hypothesis for analysis and disclose uncertainty. Relationship definitions explain semantics but do not prove that a specific relationship instance exists; cite actual relationship or source evidence for instance claims. A MAY_IMPACT path indicates potential impact, not causation. Every recommendation must cite supporting IDs and require approval.`;

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

  let relationshipDocument: string;
  try {
    relationshipDocument = readFileSync(relationshipDocumentPath, "utf8");
    if (!parseRelationshipGuidance(relationshipDocument).length)
      throw new Error("The relationship document contains no recognized relationship guidance.");
  } catch {
    return failure(503, "Authoritative relationship guidance is unavailable. Copilot cannot safely answer this request.");
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
  const contextPacket: CopilotContextPacket = buildInvestigationContext(snapshot, message, { relationshipDocument });
  const existingMessages = existingThread.messages.at(-1)?.role === "user" && existingThread.messages.at(-1)?.idempotencyKey === idempotencyKey
    ? existingThread.messages.slice(0, -1)
    : existingThread.messages;
  const history = conversationMessages(existingMessages);

  let providerResponse;
  try {
    const request: AzureChatRequest = {
      requestId: idempotencyKey,
      messages: [
        { role: "system", content: `${COPILOT_SYSTEM_POLICY}\nPolicy version: ${COPILOT_POLICY_VERSION}\n${answerFormat(contextPacket.snapshotRevision)}` },
        ...history,
        { role: "user", content: JSON.stringify({ question: message, investigationContext: contextPacket }) },
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
    validatedAnswer = validateCopilotAnswer(parseModelAnswer(providerResponse.content), contextPacket);
  } catch (cause) {
    return failure(502, "Copilot returned an answer that could not be validated. No assistant turn was saved.", {
      validationIssue: cause instanceof CopilotAnswerValidationError ? cause.message : "The provider response was not valid JSON.",
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