import "server-only";

import { randomUUID } from "node:crypto";
import type { InvestigationId } from "../kernel/contracts/investigation-identity";
import { serverKernel } from "../kernel/server/server-kernel-runtime";
import { FileCopilotConversationStore } from "../kernel/server/file-copilot-conversation-store";
import type { CopilotConversationMessage } from "../kernel/ports/copilot-conversation-store";
import type { InvestigationSnapshot } from "../kernel/contracts/investigation-snapshot";
import type {
  CopilotAnswer,
  CopilotContextPacket,
  ConversationHistoryTurn,
  ConversationTurnDisposition,
} from "./contracts";
import {
  CopilotAnswerValidationError,
  validateCopilotAnswer,
  type CopilotAnswerValidationOutcome,
} from "./answer-validator";
import {
  buildInvestigationContext,
  engineeringPromptPayload,
  ensureEngineeringAnswerCoverage,
} from "./context-builder";
import { ensureInvestigationKnowledgeGraph } from "../plm-brain/universal/ensure-investigation-knowledge-graph";
import { completeCopilotTurn, type AzureChatRequest } from "./azure-openai-client";
import { COPILOT_POLICY_VERSION, COPILOT_SYSTEM_POLICY } from "./policy";
import {
  engineeringImpactRuntimeClient,
  type EngineeringImpactRuntimeClient,
} from "./engineering-impact-runtime-client";
import {
  createCopilotTraceContext,
  writeCopilotTraceStage,
  type CopilotTraceContext,
} from "./copilot-execution-trace";
import {
  mapEngineeringImpactRuntimeCall,
  readEngineeringImpactRuntimeRoutingConfiguration,
  routeEngineeringImpactAnswer,
} from "./engineering-impact-runtime-routing";

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
  traceContext?: CopilotTraceContext;
}

export interface CopilotTurnDependencies {
  engineeringImpactRuntimeClient?: Pick<EngineeringImpactRuntimeClient, "readiness" | "answer">;
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
  return messages.map((message) => ({
    role: message.role,
    content: message.role === "user" ? message.content : JSON.stringify(message.answer),
  }));
}

function completedConversationHistory(
  messages: readonly CopilotConversationMessage[],
): readonly ConversationHistoryTurn[] {
  const turns: ConversationHistoryTurn[] = [];

  for (let index = 0; index < messages.length - 1; index += 1) {
    const user = messages[index];
    const assistant = messages[index + 1];
    if (user.role !== "user" || assistant.role !== "assistant") continue;
    if (
      user.idempotencyKey &&
      assistant.idempotencyKey &&
      user.idempotencyKey !== assistant.idempotencyKey
    ) continue;

    const turnId = assistant.idempotencyKey ?? user.idempotencyKey;
    if (!turnId) continue;

    const runtimeDisposition = assistant.answer.runtime?.disposition;
    let disposition: ConversationTurnDisposition;
    if (runtimeDisposition === "Answer") disposition = "answer";
    else if (runtimeDisposition === "Clarify") disposition = "clarify";
    else if (runtimeDisposition === undefined) disposition = "answer";
    else continue;

    turns.push(Object.freeze({
      turnId,
      userMessage: user.content,
      assistantMessage: assistant.answer.answer,
      disposition,
    }));
    index += 1;
  }

  return Object.freeze(turns);
}

const answerFormat = (snapshotRevision: number, questionIntent: CopilotContextPacket["questionIntent"]) => `Return exactly one JSON object without code fences:
{"answer":"string","claims":[{"text":"string","kind":"fact|hypothesis","citationIds":["citation-id"]}],"recommendations":[{"text":"string","rationale":"string","citationIds":["citation-id"],"approvalRequired":true}],"uncertainties":["string"],"followUpQuestions":["string"],"snapshotRevision":${snapshotRevision}}
Use primaryEntities, majorRelationships, relationshipNarratives, impactNarratives, engineeringInsights, topImpactChains, relationshipEvidence, and strongestEvidence from the engineering brief before supportingContext. When these relationship artifacts are present, explicitly explain the major governed relationships and potential impact links; do not omit them in favor of listing entity attributes. When relationship provenance, status, strength, or supporting evidence is supplied, summarize the relevant basis and cite the evidence. For an investigation-summary or primary-entities question, identify entities by name, type, and application, then describe cross-application and impact relationships with their supplied explanations. Use all authorized supportingContext to answer requested facts and summarize application coverage; do not omit it in favor of a concise engineering brief. Application participation alone does not establish a relationship. Write a concise engineering response with Evidence, Relationships, Analysis, and Conclusion sections when relevant; include impact chains and missing evidence when material. Lead with the supported engineering consequence. Use kind=fact only for claims directly established by the active investigation snapshot and cite each fact; use kind=hypothesis for interpretation and disclose uncertainty. The supplied paths are already traversed by Lattice: explain them, but do not invent or infer new relationships. Relationship definitions describe semantics and do not prove an instance exists. A MAY_IMPACT path indicates potential impact, not causation. An empty or omitted path set is not proof that no relationship or impact exists. If entity ambiguity is provided, disclose the strongest candidate and alternatives; if clarificationRequired is true, do not make entity-specific claims and ask the supplied follow-up question. Every recommendation must cite supporting IDs and require approval. Do not include raw citation IDs in answer text.
${questionIntent === "summary" ? "This is an investigation-summary question: include the primary entities and at least one available major relationship, relationship narrative, or impact chain. " : ""}`;

async function loadSnapshot(investigationId: InvestigationId): Promise<InvestigationSnapshot | undefined> {
  return serverKernel.load(investigationId);
}

async function loadThreads(investigationId: InvestigationId) {
  return store.listThreads(investigationId);
}

export async function executeCopilotTurn(
  command: CopilotTurnCommand,
  dependencies: CopilotTurnDependencies = {},
): Promise<CopilotTurnOutcome> {
  const traceContext = command.traceContext ?? createCopilotTraceContext();
  const startedAt = Date.now();
  writeCopilotTraceStage(traceContext, {
    event: "turn.started",
    stage: "turn",
    investigationId: String(command.investigationId),
    snapshotRevision: command.expectedSnapshotRevision,
    input: {
      questionCharacters: command.message.length,
      hasThreadId: Boolean(command.threadId),
      hasTurnId: Boolean(command.idempotencyKey),
    },
    ...(traceContext.payloadDetail === "full"
      ? { fullPayload: { question: command.message } }
      : {}),
  });

  try {
    const outcome = await executeCopilotTurnCore(command, dependencies, traceContext);
    const answer = outcome.ok ? outcome.answer : undefined;
    writeCopilotTraceStage(traceContext, {
      event: outcome.ok ? "turn.completed" : "turn.failed",
      stage: "turn",
      investigationId: String(command.investigationId),
      snapshotRevision: outcome.ok ? outcome.snapshotRevision : command.expectedSnapshotRevision,
      durationMs: Date.now() - startedAt,
      outcome: outcome.ok ? answer?.runtime?.disposition ?? "completed" : "failed",
      output: outcome.ok
        ? {
            threadId: outcome.threadId,
            threadRevision: outcome.threadRevision,
            idempotentReplay: outcome.idempotentReplay,
            answerCharacters: outcome.answer.answer.length,
            citationCount: outcome.answer.citations?.length ?? 0,
          }
        : {
            status: outcome.status,
            failureCode: typeof outcome.body.failureCode === "string"
              ? outcome.body.failureCode
              : undefined,
          },
      ...(answer && traceContext.payloadDetail === "full"
        ? { fullPayload: { answer } }
        : {}),
    });
    return outcome;
  } catch (error) {
    writeCopilotTraceStage(traceContext, {
      event: "turn.failed",
      stage: "turn",
      investigationId: String(command.investigationId),
      snapshotRevision: command.expectedSnapshotRevision,
      durationMs: Date.now() - startedAt,
      outcome: "exception",
      diagnostics: { errorType: error instanceof Error ? error.name : "UnknownError" },
    });
    throw error;
  }
}

async function executeCopilotTurnCore(
  command: CopilotTurnCommand,
  dependencies: CopilotTurnDependencies,
  traceContext: CopilotTraceContext,
): Promise<CopilotTurnOutcome> {
  const {
    investigationId,
    expectedSnapshotRevision,
    idempotencyKey,
    message,
    signal,
  } = command;
  if (!message.trim() || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(idempotencyKey))
    return failure(400, "Copilot message or request identifier is invalid.");

  const runtimeClient = dependencies.engineeringImpactRuntimeClient ?? engineeringImpactRuntimeClient;
  const impactRoute = routeEngineeringImpactAnswer(
    { question: message, investigationId },
    readEngineeringImpactRuntimeRoutingConfiguration(runtimeClient.readiness()),
  );
  traceContext.routeSource = impactRoute.route === "runtime"
    ? "UnifiedRuntime"
    : impactRoute.route === "legacy"
      ? "LegacyFrontend"
      : "Unknown";
  writeCopilotTraceStage(traceContext, {
    event: "route.selected",
    stage: "routing",
    investigationId: String(investigationId),
    snapshotRevision: expectedSnapshotRevision,
    input: { questionCharacters: message.length },
    output: {
      route: impactRoute.route,
      routeSource: traceContext.routeSource,
      runtimeEndpointAvailable: runtimeClient.readiness().endpointConfigured,
      runtimeCredentialProviderAvailable: runtimeClient.readiness().credentialProviderConfigured,
    },
    ...(traceContext.payloadDetail === "full"
      ? { fullPayload: { question: message } }
      : {}),
  });

  const snapshot = await loadSnapshot(investigationId);
  writeCopilotTraceStage(traceContext, {
    event: "snapshot.loaded",
    stage: "snapshot",
    investigationId: String(investigationId),
    snapshotRevision: snapshot?.identity.revision,
    outcome: snapshot ? "found" : "not-found",
    output: snapshot
      ? { revision: snapshot.identity.revision, archived: Boolean(snapshot.archivedAt) }
      : { found: false },
  });
  if (!snapshot) return failure(404, "Investigation was not found.");
  if (snapshot.archivedAt) return failure(409, "Restore the investigation before adding copilot messages.");
  if (snapshot.identity.revision !== expectedSnapshotRevision)
    return failure(409, "The investigation changed before the message could be saved.", { revision: snapshot.identity.revision });

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
  const existingMessages = existingThread.messages.at(-1)?.role === "user" && existingThread.messages.at(-1)?.idempotencyKey === idempotencyKey
    ? existingThread.messages.slice(0, -1)
    : existingThread.messages;
  const history = conversationMessages(existingMessages);
  const conversationHistory = completedConversationHistory(existingMessages);
  const stateDisposition = existingThread.conversationState?.lastTurnDisposition;
  const stateParentTurnId = stateDisposition === "answer" || stateDisposition === "clarify"
    ? existingThread.conversationState?.previousTurnId
    : undefined;
  const parentTurnId = stateParentTurnId ?? conversationHistory.at(-1)?.turnId;

  if (impactRoute.route === "blocked" || impactRoute.route === "runtime") {
    let runtimeResult;
    if (impactRoute.route === "blocked") {
      runtimeResult = {
        status: "unavailable" as const,
        code: "runtime-credential-not-configured",
      };
    } else {
      runtimeResult = await runtimeClient.answer({
        question: message,
        investigationId: String(investigationId),
        conversationId: threadId,
        turnId: idempotencyKey,
        snapshotRevision: snapshot.identity.revision,
        traceContext,
        ...(parentTurnId ? { parentTurnId } : {}),
        ...(existingThread.conversationState
          ? { previousConversationState: existingThread.conversationState }
          : {}),
        ...(conversationHistory.length ? { conversationHistory } : {}),
        ...(signal ? { signal } : {}),
      });
    }
    writeCopilotTraceStage(traceContext, {
      event: "runtime.completed",
      stage: "runtime",
      investigationId: String(investigationId),
      snapshotRevision: snapshot.identity.revision,
      outcome: runtimeResult.status,
      output: runtimeResult.status === "response"
      ? {
          disposition: runtimeResult.response.disposition,
          impactCount: runtimeResult.response.impacts.length,
          factCount: runtimeResult.response.facts?.length ?? 0,
          applicationContextCount: runtimeResult.response.applicationContexts?.length ?? 0,
          sourceEvidenceCount: runtimeResult.response.sourceEvidence?.length ?? 0,
          sourceCount: runtimeResult.response.sources.length,
        }
      : { status: runtimeResult.status, code: runtimeResult.status === "denied" ? undefined : runtimeResult.code },
      ...(runtimeResult.status === "response" && traceContext.payloadDetail === "full"
      ? { fullPayload: { runtimeResponse: runtimeResult.response } }
      : {}),
    });

    const answer = mapEngineeringImpactRuntimeCall(runtimeResult, snapshot.identity.revision);
    const responseState = runtimeResult.status === "response"
      ? runtimeResult.response.continuationState
      : undefined;
    const validResponseState = responseState &&
      responseState.conversationId === threadId &&
      responseState.investigationId === String(investigationId) &&
      responseState.previousTurnId === idempotencyKey &&
      /^[a-f0-9]{64}$/.test(responseState.ownerFingerprint ?? "")
        ? responseState
        : undefined;
    if (runtimeResult.status === "response" &&
        (runtimeResult.response.continuationStateStatus === "invalid" ||
         runtimeResult.response.continuationState && !validResponseState)) {
      console.warn("Engineering Impact runtime continuation state was rejected; preserving the answer without state.");
    }
    const nextConversationState = runtimeResult.status === "response" &&
      (runtimeResult.response.disposition === "Answer" || runtimeResult.response.disposition === "Clarify")
        ? validResponseState ?? null
        : undefined;
    const completed = await store.appendTurn(investigationId, threadId, stagedThread.threadRevision, message, {
      answer,
      at: new Date().toISOString(),
      snapshotRevision: snapshot.identity.revision,
      idempotencyKey,
    }, nextConversationState);
    const assistant = completed.messages.at(-1);
    if (!assistant || assistant.role !== "assistant")
      return failure(503, "Runtime response was not persisted. Do not retry automatically.");
    writeCopilotTraceStage(traceContext, {
      event: "answer.finalized",
      stage: "final-response",
      investigationId: String(investigationId),
      snapshotRevision: snapshot.identity.revision,
      outcome: "persisted-and-returned",
      output: {
        ...(assistant.answer.runtime?.disposition
          ? { disposition: assistant.answer.runtime.disposition }
          : {}),
        answerCharacters: assistant.answer.answer.length,
        claimCount: assistant.answer.claims.length,
        citationCount: assistant.answer.citations?.length ?? 0,
      },
      ...(traceContext.payloadDetail === "full"
        ? { fullPayload: { answer: assistant.answer } }
        : {}),
    });
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

  let contextSnapshot: InvestigationSnapshot;
  const graphNormalizationStartedAt = Date.now();
  try {
    contextSnapshot = ensureInvestigationKnowledgeGraph(snapshot);
    writeCopilotTraceStage(traceContext, {
      event: "legacy.graph-normalization.completed",
      stage: "graph-normalization",
      investigationId: String(investigationId),
      snapshotRevision: snapshot.identity.revision,
      durationMs: Date.now() - graphNormalizationStartedAt,
      outcome: "completed",
      input: {
        acceptedEvidenceCount: snapshot.acceptedEvidenceIds.length,
        selectedSourceCount: snapshot.selections.length,
      },
      output: {
        knowledgeGraphPresent: Boolean(
          contextSnapshot.canonical?.value &&
          typeof contextSnapshot.canonical.value === "object" &&
          "knowledgeGraph" in contextSnapshot.canonical.value,
        ),
      },
    });
  } catch (error) {
    writeCopilotTraceStage(traceContext, {
      event: "legacy.graph-normalization.failed",
      stage: "graph-normalization",
      investigationId: String(investigationId),
      snapshotRevision: snapshot.identity.revision,
      durationMs: Date.now() - graphNormalizationStartedAt,
      outcome: "failed",
      diagnostics: { errorType: error instanceof Error ? error.name : "UnknownError" },
    });
    return failure(503, "The authoritative relationship ontology is unavailable. Copilot cannot safely answer this request.");
  }

  const contextBuilderStartedAt = Date.now();
  writeCopilotTraceStage(traceContext, {
    event: "legacy.context-builder.started",
    stage: "context-builder",
    investigationId: String(investigationId),
    snapshotRevision: snapshot.identity.revision,
    input: {
      questionCharacters: message.length,
      selectedSources: snapshot.selections.map((selection) => selection.source),
      sourceExecutionStatuses: Object.fromEntries(
        Object.entries(snapshot.executions).map(([source, execution]) => [source, execution.status]),
      ),
      acceptedEvidenceCount: snapshot.acceptedEvidenceIds.length,
    },
    ...(traceContext.payloadDetail === "full"
      ? { fullPayload: { question: message, snapshot: contextSnapshot } }
      : {}),
  });
  const contextPacket: CopilotContextPacket = buildInvestigationContext(contextSnapshot, message);
  const applicationsPresent = [...new Set(snapshot.selections.map((selection) => selection.source))].sort();
  const applicationsIncluded = [...new Set([
    ...contextPacket.sourceSelections.map((source) => source.source),
    ...contextPacket.entities.flatMap((entity) => entity.source ? [entity.source] : []),
    ...contextPacket.relationships.flatMap((relationship) => [
      contextPacket.entities.find((entity) => entity.entityId === relationship.sourceEntityId)?.source,
      contextPacket.entities.find((entity) => entity.entityId === relationship.targetEntityId)?.source,
    ].filter((source): source is string => Boolean(source))),
    ...contextPacket.evidence.flatMap((evidence) => evidence.source ? [evidence.source] : []),
  ])].sort();
  const omittedItemCounts = Object.entries(contextPacket.omissions.omittedCounts)
    .filter(([, count]) => count > 0)
    .map(([category, count]) => `${category}:${count}`);
  writeCopilotTraceStage(traceContext, {
    event: "question.interpreted",
    stage: "question-interpretation",
    investigationId: String(investigationId),
    snapshotRevision: contextPacket.snapshotRevision,
    outcome: "interpreted",
    input: { questionCharacters: message.length },
    output: {
      intent: contextPacket.questionIntent,
      selectedEntityIds: contextPacket.selectedEntityIds,
      entityCandidateCount: contextPacket.entityCandidates.length,
      clarificationRequired: contextPacket.ambiguity.clarificationRequired,
      ambiguityDetected: contextPacket.ambiguity.detected,
    },
  });
  writeCopilotTraceStage(traceContext, {
    event: "legacy.context-built",
    stage: "context-builder",
    investigationId: String(investigationId),
    snapshotRevision: contextPacket.snapshotRevision,
    durationMs: Date.now() - contextBuilderStartedAt,
    outcome: "completed",
    input: {
      applicationsPresent,
      sourceExecutionStatuses: Object.fromEntries(
        Object.entries(snapshot.executions).map(([source, execution]) => [source, execution.status]),
      ),
      acceptedEvidenceCount: snapshot.acceptedEvidenceIds.length,
    },
    output: {
      questionIntent: contextPacket.questionIntent,
      entityCandidateCount: contextPacket.entityCandidates.length,
      selectedEntityCount: contextPacket.selectedEntityIds.length,
      entityCount: contextPacket.entities.length,
      relationshipCount: contextPacket.relationships.length,
      relationshipPathCount: contextPacket.relationshipPaths.length,
      impactPathCount: contextPacket.impactPaths.length,
      findingCount: contextPacket.findings.length,
      evidenceCount: contextPacket.evidence.length,
      citationCount: contextPacket.citations.length,
      uncertaintyCount: contextPacket.uncertainties.length,
      applicationsPresent,
      applicationsIncluded,
      applicationsNotRepresentedInContext: applicationsPresent.filter((application) =>
        !applicationsIncluded.includes(application),
      ),
      applicationCoverage: applicationsPresent.map((application) => ({
        application,
        included: applicationsIncluded.includes(application),
        exclusionReason: applicationsIncluded.includes(application)
          ? null
          : "not-exposed-by-legacy-context-builder",
      })),
      omissionCategories: contextPacket.omissions.categories,
      omittedCounts: contextPacket.omissions.omittedCounts,
    },
    itemsRemoved: omittedItemCounts,
    rejectionReasons: [...contextPacket.omissions.categories],
    diagnostics: {
      omittedItemReasonDetail: "The legacy context builder exposes category counts, not per-candidate rejection reasons.",
    },
    ...(traceContext.payloadDetail === "full"
      ? { fullPayload: { contextPacket, snapshot: contextSnapshot } }
      : {}),
  });

  if (contextPacket.ambiguity.clarificationRequired) {
    const candidates = contextPacket.entityCandidates;
    const candidateLines = candidates.map((candidate) =>
      `- ${candidate.label}${candidate.source ? ` (${candidate.source})` : ""}${candidate.nativeId ? ` · ${candidate.nativeId}` : ""} — match score ${candidate.score.toFixed(2)}`,
    );
    const answer: CopilotAnswer = {
      answer: [
        "The same explicit identifier or governed value matches multiple records in this investigation.",
        ...(candidateLines.length ? ["Possible matches:", ...candidateLines] : ["No matching entity was found in the active investigation snapshot."]),
        "Please select the intended record so I do not attribute its evidence to another entity.",
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
    const validationOutcomes: CopilotAnswerValidationOutcome[] = [];
    const validatedAnswer = validateCopilotAnswer(answer, contextPacket, (outcome) => validationOutcomes.push(outcome));
    writeCopilotTraceStage(traceContext, {
      event: "answer.validation.completed",
      stage: "answer-validation",
      investigationId: String(investigationId),
      snapshotRevision: contextPacket.snapshotRevision,
      outcome: "accepted",
      output: {
        assertions: validationOutcomes,
        semanticSupportAssessment: "not-performed-by-legacy-frontend-validator",
        acceptedAssertionCount: validationOutcomes.filter((item) => item.accepted).length,
        rejectedAssertionCount: validationOutcomes.filter((item) => !item.accepted).length,
      },
    });
    writeCopilotTraceStage(traceContext, {
      event: "citations.resolved",
      stage: "citation-resolution",
      investigationId: String(investigationId),
      snapshotRevision: contextPacket.snapshotRevision,
      outcome: "completed",
      input: { availableCitationCount: contextPacket.citations.length },
      output: {
        resolvedCitationIds: (validatedAnswer.citations ?? []).map((citation) => citation.citationId),
        resolvedCitationCount: validatedAnswer.citations?.length ?? 0,
      },
    });
    const completed = await store.appendTurn(investigationId, threadId, stagedThread.threadRevision, message, {
      answer: validatedAnswer,
      at: new Date().toISOString(),
      snapshotRevision: snapshot.identity.revision,
      idempotencyKey,
    });
    const assistant = completed.messages.at(-1);
    if (!assistant || assistant.role !== "assistant")
      return failure(503, "Clarification response was not persisted. Do not retry automatically.");
    writeCopilotTraceStage(traceContext, {
      event: "answer.finalized",
      stage: "final-response",
      investigationId: String(investigationId),
      snapshotRevision: snapshot.identity.revision,
      outcome: "persisted-and-returned",
      output: {
        answerCharacters: assistant.answer.answer.length,
        claimCount: assistant.answer.claims.length,
        citationCount: assistant.answer.citations?.length ?? 0,
      },
      ...(traceContext.payloadDetail === "full"
        ? { fullPayload: { answer: assistant.answer } }
        : {}),
    });
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

  const promptAssemblyStartedAt = Date.now();
  const promptPayload = engineeringPromptPayload(message, contextPacket);
  const promptMessages = [
    { role: "system" as const, content: `${COPILOT_SYSTEM_POLICY}\nPolicy version: ${COPILOT_POLICY_VERSION}\n${answerFormat(contextPacket.snapshotRevision, contextPacket.questionIntent)}` },
    ...history,
    { role: "user" as const, content: JSON.stringify(promptPayload) },
  ];
  writeCopilotTraceStage(traceContext, {
    event: "prompt.assembled",
    stage: "prompt-assembly",
    investigationId: String(investigationId),
    snapshotRevision: contextPacket.snapshotRevision,
    durationMs: Date.now() - promptAssemblyStartedAt,
    outcome: "assembled",
    output: {
      messageCount: promptMessages.length,
      promptCharacters: promptMessages.reduce((total, promptMessage) => total + promptMessage.content.length, 0),
      promptBytesUtf8: Buffer.byteLength(JSON.stringify(promptMessages), "utf8"),
      entityCount: contextPacket.entities.length,
      factCount: contextPacket.entities.reduce((total, entity) => total + Object.keys(entity.properties).length, 0),
      relationshipCount: contextPacket.relationships.length,
      relationshipNarrativeCount: contextPacket.engineeringBrief.relationshipNarratives.length,
      evidenceCount: contextPacket.evidence.length,
      applicationDigestCount: 0,
      applicationDigestStatus: "not-a-distinct-input-in-legacy-context-packet",
      citationCount: contextPacket.citations.length,
      applicationsRepresented: applicationsIncluded,
    },
    ...(traceContext.payloadDetail === "full"
      ? { fullPayload: { messages: promptMessages } }
      : {}),
  });

  let providerResponse;
  try {
    const request: AzureChatRequest = {
      requestId: idempotencyKey,
      messages: promptMessages,
      traceContext,
      investigationId: String(investigationId),
      snapshotRevision: contextPacket.snapshotRevision,
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
    writeCopilotTraceStage(traceContext, {
      event: "model.invocation.failed",
      stage: "model-invocation",
      investigationId: String(investigationId),
      snapshotRevision: contextPacket.snapshotRevision,
      outcome: "failed",
      output: {
        failureCode,
        ...(providerStatus !== undefined ? { providerStatus } : {}),
        retryable: !ambiguousBilling && retryableStatus,
        requestMayHaveBeenBilled: ambiguousBilling,
      },
      diagnostics: { errorType: cause instanceof Error ? cause.name : "UnknownError" },
    });
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
  const validationOutcomes: CopilotAnswerValidationOutcome[] = [];
  try {
    const parsedAnswer = parseModelAnswer(providerResponse.content);
    const repairedAnswer = repairProviderAnswer(parsedAnswer, contextPacket);
    const modelAnswer = ensureEngineeringAnswerCoverage(
      repairedAnswer,
      contextPacket.engineeringBrief,
      contextPacket.citations,
      contextPacket.questionIntent === "summary",
    );
    validatedAnswer = validateCopilotAnswer(modelAnswer, contextPacket, (outcome) => validationOutcomes.push(outcome));
    writeCopilotTraceStage(traceContext, {
      event: "answer.validation.completed",
      stage: "answer-validation",
      investigationId: String(investigationId),
      snapshotRevision: contextPacket.snapshotRevision,
      outcome: "accepted",
      output: {
        assertions: validationOutcomes,
        semanticSupportAssessment: "not-performed-by-legacy-frontend-validator",
        acceptedAssertionCount: validationOutcomes.filter((item) => item.accepted).length,
        rejectedAssertionCount: validationOutcomes.filter((item) => !item.accepted).length,
      },
    });
    writeCopilotTraceStage(traceContext, {
      event: "citations.resolved",
      stage: "citation-resolution",
      investigationId: String(investigationId),
      snapshotRevision: contextPacket.snapshotRevision,
      outcome: "completed",
      input: { availableCitationCount: contextPacket.citations.length },
      output: {
        resolvedCitationIds: (validatedAnswer.citations ?? []).map((citation) => citation.citationId),
        resolvedCitationCount: validatedAnswer.citations?.length ?? 0,
      },
    });
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
      error: cause instanceof Error ? cause.message : String(cause),
    });
    writeCopilotTraceStage(traceContext, {
      event: "answer.validation.failed",
      stage: "answer-validation",
      investigationId: String(investigationId),
      snapshotRevision: contextPacket.snapshotRevision,
      outcome: "rejected",
      output: {
        category,
        assertions: validationOutcomes,
        semanticSupportAssessment: "not-performed-by-legacy-frontend-validator",
      },
      ...(traceContext.payloadDetail === "full"
        ? { fullPayload: { providerOutput: providerResponse.content } }
        : {}),
      diagnostics: { error: cause instanceof Error ? cause.message : String(cause) },
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
  writeCopilotTraceStage(traceContext, {
    event: "answer.finalized",
    stage: "final-response",
    investigationId: String(investigationId),
    snapshotRevision: snapshot.identity.revision,
    outcome: "persisted-and-returned",
    output: {
      answerCharacters: assistant.answer.answer.length,
      claimCount: assistant.answer.claims.length,
      citationCount: assistant.answer.citations?.length ?? 0,
    },
    ...(traceContext.payloadDetail === "full"
      ? { fullPayload: { answer: assistant.answer } }
      : {}),
  });
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