import "server-only";

import { randomUUID } from "node:crypto";
import type { InvestigationId } from "../kernel/contracts/investigation-identity";
import { serverKernel } from "../kernel/server/server-kernel-runtime";
import { FileCopilotConversationStore } from "../kernel/server/file-copilot-conversation-store";
import type { CopilotConversationMessage } from "../kernel/ports/copilot-conversation-store";
import type { InvestigationSnapshot } from "../kernel/contracts/investigation-snapshot";
import type { CopilotAnswer, CopilotCitation, CopilotContextPacket } from "./contracts";
import {
  classifyConsequenceClaim,
  CopilotAnswerValidationError,
  requiredConsequenceCitationType,
  validateCopilotAnswer,
  type CopilotValidationDiagnostics,
} from "./answer-validator";
import {
  buildInvestigationContext,
  consequenceEndpointLabel,
  engineeringPromptPayload,
  ensureEngineeringAnswerCoverage,
} from "./context-builder";
import { ensureInvestigationKnowledgeGraph } from "../plm-brain/universal/ensure-investigation-knowledge-graph";
import { completeCopilotTurn, type AzureChatRequest } from "./azure-openai-client";
import { COPILOT_POLICY_VERSION, COPILOT_SYSTEM_POLICY } from "./policy";
import {
  recordCopilotTurnStage,
  type CopilotFailureCategory,
  type CopilotRetrievalOutcome,
  type CopilotTurnStage,
} from "./turn-stage-journal";
import type { RetrievalDiagnostics, RetrievalEvidence, RetrievalRejectionReason } from "./retrieval/contracts";
import { allocateRetrievalBudget } from "./retrieval/allocate-retrieval-budget";
import { buildRetrievalQuery } from "./retrieval/build-retrieval-query";
import { getDocumentRetrievalRuntime } from "./retrieval/retrieval-runtime";
import { retrieveEvidence } from "./retrieval/retrieve-evidence";

const MAX_HISTORY_MESSAGES = 12;
const MAX_THREAD_LIST = 50;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 10;
const store = new FileCopilotConversationStore();
const requestTimes = new Map<string, number[]>();

interface TurnTracker {
  requestId: string;
  investigationId: InvestigationId;
  threadId?: string;
  snapshotRevision: number;
  failingStage: CopilotTurnStage;
  providerStatus?: number;
  requestMayHaveBeenBilled: boolean;
}

class TurnStageError extends Error {
  constructor(
    readonly category: CopilotFailureCategory,
    readonly stage: CopilotTurnStage,
    cause: unknown,
  ) {
    super(`Copilot turn failed during ${stage}.`, { cause });
    this.name = "TurnStageError";
  }
}

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
  cause?: unknown;
}

export type CopilotTurnOutcome = CopilotTurnSuccess | CopilotTurnFailure;

function failure(status: number, message: string, extra: Record<string, unknown> = {}, cause?: unknown): CopilotTurnFailure {
  return { ok: false, status, body: { message, ...extra }, ...(cause !== undefined ? { cause } : {}) };
}

function providerFailureCategory(error: unknown): CopilotFailureCategory {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  if (code === "provider-http-error") return "provider-http-error";
  if (code === "network-error" || code === "timeout") return "provider-network-error";
  if (code === "invalid-provider-response") return "response-shape";
  if (code === "usage-ledger-error") return "usage-ledger-error";
  return "unknown-runtime-error";
}

function validationFailureCategory(error: unknown): CopilotFailureCategory {
  if (error instanceof Error && error.message === "malformed-json") return "malformed-json";
  if (error instanceof CopilotAnswerValidationError) {
    if (/answer must be a JSON object/i.test(error.message)) return "response-shape";
    if (/snapshot revision/i.test(error.message)) return "snapshot-validation";
    if (/citation/i.test(error.message)) return "citation-validation";
    return "schema-validation";
  }
  return "response-shape";
}

function isFailureCategory(value: unknown): value is CopilotFailureCategory {
  return typeof value === "string" && [
    "malformed-json", "schema-validation", "response-shape", "citation-validation",
    "snapshot-validation", "answer-coverage", "conversation-persistence", "context-budget",
    "provider-http-error", "provider-network-error", "usage-ledger-error", "unknown-runtime-error",
  ].includes(value);
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
  let strictParseError: unknown;
  try {
    return JSON.parse(content) as unknown;
  } catch (cause) {
    strictParseError = cause;
    const unfenced = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const start = unfenced.indexOf("{");
    if (start < 0) throw new Error("malformed-json", { cause });
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
    if (end < 0 || unfenced.slice(end + 1).trim().includes("{"))
      throw new Error("malformed-json", { cause: strictParseError });
    try {
      return JSON.parse(unfenced.slice(start, end + 1)) as unknown;
    } catch (cause) {
      throw new Error("malformed-json", { cause });
    }
  }
}

function repairProviderAnswer(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const answer = value as Record<string, unknown>;
  if (typeof answer.answer !== "string" || !answer.answer.trim()) return value;
  const claims = (Array.isArray(answer.claims) ? answer.claims : []).flatMap((claim) => {
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) return [];
    const item = claim as Record<string, unknown>;
    if (typeof item.text !== "string" || !item.text.trim()) return [];
    const kind = item.kind === "fact" || item.kind === "hypothesis" ? item.kind : "hypothesis";
    const citationIds = Array.isArray(item.citationIds)
      ? [...new Set(item.citationIds.filter((id): id is string => typeof id === "string"))]
      : [];
    return [{ text: item.text, kind, citationIds }];
  });
  const recommendations = (Array.isArray(answer.recommendations) ? answer.recommendations : []).flatMap((recommendation) => {
    if (!recommendation || typeof recommendation !== "object" || Array.isArray(recommendation)) return [];
    const item = recommendation as Record<string, unknown>;
    if (item.approvalRequired !== true || typeof item.text !== "string" || typeof item.rationale !== "string") return [];
    const citationIds = Array.isArray(item.citationIds)
      ? [...new Set(item.citationIds.filter((id): id is string => typeof id === "string"))]
      : [];
    return [{ text: item.text, rationale: item.rationale, citationIds, approvalRequired: true as const }];
  });
  return {
    ...answer,
    claims,
    recommendations,
    uncertainties: Array.isArray(answer.uncertainties) ? answer.uncertainties.filter((item): item is string => typeof item === "string") : [],
    followUpQuestions: Array.isArray(answer.followUpQuestions) ? answer.followUpQuestions.filter((item): item is string => typeof item === "string") : [],
  };
}

function repairConsequenceAnswer(
  value: unknown,
  context: CopilotContextPacket,
): {
  answer: unknown;
  repairApplied: boolean;
  removedCitationIds: string[];
  removedClaimCategories: string[];
  unknownCitationIds: string[];
} {
  const state = context.consequenceEvidenceState;
  const answer = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
  const claims = Array.isArray(answer?.claims) ? answer.claims : [];
  const hasInsufficientEvidenceClaim = claims.some((claim) => {
    const item = claim && typeof claim === "object" && !Array.isArray(claim)
      ? claim as Record<string, unknown>
      : undefined;
    return typeof item?.text === "string" &&
      classifyConsequenceClaim(item.text) === "relationship-not-established";
  });
  const originalIds = claims.flatMap((claim) => {
    const item = claim && typeof claim === "object" && !Array.isArray(claim)
      ? claim as Record<string, unknown>
      : undefined;
    return Array.isArray(item?.citationIds)
      ? item.citationIds.filter((id): id is string => typeof id === "string")
      : [];
  });
  const knownIds = new Set(context.citations.map((citation) => citation.citationId));
  const unknownCitationIds = [...new Set(originalIds.filter((id) => !knownIds.has(id)))].slice(0, 100);
  if (unknownCitationIds.length) {
    return {
      answer: value,
      repairApplied: false,
      removedCitationIds: [],
      removedClaimCategories: [],
      unknownCitationIds,
    };
  }
  if (!state || state.allowedConclusion !== "insufficient-evidence" ||
      typeof answer?.answer !== "string" ||
      (classifyConsequenceClaim(answer.answer) !== "relationship-not-established" &&
        (state.ontologyRelationshipEstablished || !hasInsufficientEvidenceClaim))) {
    return {
      answer: value,
      repairApplied: false,
      removedCitationIds: [],
      removedClaimCategories: [],
      unknownCitationIds: [],
    };
  }

  const allowedIds = new Set(state.allowedCitationIds);
  const removedCitationIds = new Set<string>();
  const removedClaimCategories = new Set<string>();
  const repairedClaims = claims.flatMap((claim) => {
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) return [];
    const item = claim as Record<string, unknown>;
    if (typeof item.text !== "string" || !item.text.trim()) return [];
    const claimType = classifyConsequenceClaim(item.text);
    if ((!state.ontologyRelationshipEstablished && claimType === "operational-representation-established") ||
        claimType === "potential-operational-impact" ||
        claimType === "specific-operational-effect") {
      removedClaimCategories.add(claimType);
      return [];
    }
    const citationIds = Array.isArray(item.citationIds)
      ? item.citationIds.filter((id): id is string => typeof id === "string")
      : [];
    const applicableIds = claimType === "same-subject-background"
      ? [...state.sourceEntityCitationIds, ...state.targetEntityCitationIds, ...state.subjectTraceabilityCitationIds]
      : claimType === "relationship-not-established"
        ? [...state.sourceEntityCitationIds, ...state.targetEntityCitationIds, ...state.unresolvedEvaluationCitationIds]
        : state.allowedCitationIds;
    const applicableSet = new Set(applicableIds);
    const validIds = citationIds.filter((id) => {
      const valid = allowedIds.has(id) && applicableSet.has(id);
      if (!valid) {
        removedCitationIds.add(id);
      }
      return valid;
    });
    const citations = [...new Set([
      ...validIds,
      ...(validIds.length ? [] : applicableIds.filter((id) => allowedIds.has(id))),
    ])];
    return [{ ...item, citationIds: citations }];
  });
  if (!repairedClaims.some((claim) => classifyConsequenceClaim(String(claim.text)) === "relationship-not-established")) {
    repairedClaims.push({
      text: state.ontologyRelationshipEstablished
        ? "No specific downstream operational consequence can currently be established from the available evidence."
        : "The available evidence does not establish the requested operational representation.",
      kind: "fact",
      citationIds: [...new Set([
        ...state.sourceEntityCitationIds,
        ...state.targetEntityCitationIds,
        ...state.unresolvedEvaluationCitationIds,
      ])].filter((id) => allowedIds.has(id)),
    });
  }
  const repairedAnswer = {
    ...answer,
    ...(!state.ontologyRelationshipEstablished ? {
      answer: `The available evidence does not establish that the ${consequenceEndpointLabel(context, state.sourceEntityId, "source record")} is operationally represented as the ${consequenceEndpointLabel(context, state.targetEntityId, "target record")}. Therefore, no operational consequence can currently be established.`,
    } : {}),
    claims: repairedClaims,
  };
  const repairApplied = JSON.stringify(repairedAnswer) !== JSON.stringify(answer);
  return {
    answer: repairedAnswer,
    repairApplied,
    removedCitationIds: [...removedCitationIds].slice(0, 100),
    removedClaimCategories: [...removedClaimCategories].slice(0, 100),
    unknownCitationIds: [],
  };
}

function providerCitationIds(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const answer = value as Record<string, unknown>;
  const rows = [
    ...(Array.isArray(answer.claims) ? answer.claims : []),
    ...(Array.isArray(answer.recommendations) ? answer.recommendations : []),
  ];
  return [...new Set(rows.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const citationIds = (row as Record<string, unknown>).citationIds;
    return Array.isArray(citationIds)
      ? citationIds.filter((id): id is string => typeof id === "string")
      : [];
  }))].slice(0, 100);
}

function providerClaimRequirements(value: unknown): { claimType: string; requiredCitationType: string }[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const claims = (value as Record<string, unknown>).claims;
  if (!Array.isArray(claims)) return [];
  return claims.flatMap((claim) => {
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) return [];
    const text = (claim as Record<string, unknown>).text;
    if (typeof text !== "string") return [];
    const claimType = classifyConsequenceClaim(text);
    return [{ claimType, requiredCitationType: requiredConsequenceCitationType(claimType) }];
  }).slice(0, 100);
}

function providerUncitedFactualClaimCount(value: unknown): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const claims = (value as Record<string, unknown>).claims;
  if (!Array.isArray(claims)) return 0;
  return claims.filter((claim) => {
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) return false;
    const item = claim as Record<string, unknown>;
    return item.kind === "fact" && (!Array.isArray(item.citationIds) || item.citationIds.length === 0);
  }).length;
}

function conversationMessages(messages: readonly CopilotConversationMessage[]) {
  return messages.slice(-MAX_HISTORY_MESSAGES).map((message) => ({
    role: message.role,
    content: message.role === "user" ? message.content : JSON.stringify(message.answer),
  }));
}

const answerFormat = (
  snapshotRevision: number,
  questionIntent: CopilotContextPacket["questionIntent"],
  consequenceEvidenceState?: CopilotContextPacket["consequenceEvidenceState"],
) => `Return exactly one JSON object without code fences:
{"answer":"string","claims":[{"text":"string","kind":"fact|hypothesis","citationIds":["citation-id"]}],"recommendations":[{"text":"string","rationale":"string","citationIds":["citation-id"],"approvalRequired":true}],"uncertainties":["string"],"followUpQuestions":["string"],"snapshotRevision":${snapshotRevision}}
Use primaryEntities, majorRelationships, relationshipNarratives, impactNarratives, engineeringInsights, topImpactChains, relationshipEvidence, and strongestEvidence from the engineering brief before supportingContext. When these relationship artifacts are present, explicitly explain the major governed relationships and potential impact links; do not omit them in favor of listing entity attributes. When relationship provenance, status, strength, or supporting evidence is supplied, summarize the relevant basis and cite the evidence. For an investigation-summary or primary-entities question, identify entities by name, type, and application, then describe cross-application and impact relationships with their supplied explanations. Treat subjectApplicationParticipation and subject-traceability narratives as informational evidence of shared investigation participation only; they do not prove object identity, a direct engineering relationship, causation, or operational impact, and must never be treated as impact evidence. Do not dump field-level properties, accounting fields, or metadata unless specifically requested. Treat supportingContext as corroborating detail and consult it only when needed. Write a concise engineering response with Evidence, Relationships, Analysis, and Conclusion sections when relevant; include impact chains and missing evidence when material. Lead with the supported engineering consequence. Use kind=fact only for claims directly established by the active investigation snapshot and cite each fact; use kind=hypothesis for interpretation and disclose uncertainty. The supplied paths are already traversed by Lattice: explain them, but do not invent or infer new relationships. Relationship definitions describe semantics and do not prove an instance exists. A MAY_IMPACT path indicates potential impact, not causation. An empty or omitted path set is not proof that no relationship or impact exists. If entity ambiguity is provided, disclose the strongest candidate and alternatives; if clarificationRequired is true, do not make entity-specific claims and ask the supplied follow-up question. Every recommendation must cite supporting IDs and require approval. Do not include raw citation IDs in answer text.
${questionIntent === "summary" ? "This is an investigation-summary question: name every application in applicationsPresent, explain each application's contribution from subjectApplicationParticipation, state that shared-subject participation is not a direct ontology-resolved engineering relationship, and include application-balanced primary entities. " : ""}
${questionIntent === "impact" ? "For operational-impact questions, do not infer downstream effects from subjectApplicationParticipation or shared investigation subjects. If no eligible ontology-resolved relationship and impact path supports the asserted cross-system link, state that the saved evidence does not establish it and that no operational consequence can currently be established. Do not speculate about inventory, production, procurement, cost, compliance, or disruption. " : ""}
${questionIntent === "document" ? "For document-content questions, retrievedDocumentEvidence may support factual claims about the cited document content only; cite its supplied retrieval-document citation IDs. Retrieved text does not establish canonical identity, ontology or engineering relationships, subject traceability, impact paths or chains, or operational consequences; use authoritative graph citations for those claims. " : ""}
${consequenceEvidenceState ? `M2 consequence evidence state: ${JSON.stringify(consequenceEvidenceState)}. Follow allowedConclusion exactly. Shared investigation participation is background only. If ontologyRelationshipEstablished is false, do not claim operational representation or dependency; explain that the saved evidence does not establish the relationship without asserting it does not exist. If no eligible impact path or chain is available, do not claim operational impact, causation, or propagation. Never state a prohibited specific effect without its explicit evidence citation. No impact citation is required for a no-evidence conclusion. Cite only supplied IDs; relationship-not-established claims may use selected-entity or unresolved-evaluation citations.` : ""}`;

async function loadSnapshot(investigationId: InvestigationId): Promise<InvestigationSnapshot | undefined> {
  return serverKernel.load(investigationId);
}

async function loadThreads(investigationId: InvestigationId) {
  return store.listThreads(investigationId, MAX_THREAD_LIST);
}

async function journalTurnStage(
  tracker: TurnTracker,
  stage: CopilotTurnStage,
  details: Partial<Parameters<typeof recordCopilotTurnStage>[0]> = {},
): Promise<void> {
  tracker.failingStage = stage;
  await recordCopilotTurnStage({
    requestId: tracker.requestId,
    investigationId: tracker.investigationId,
    threadId: tracker.threadId,
    snapshotRevision: tracker.snapshotRevision,
    stage,
    requestMayHaveBeenBilled: tracker.requestMayHaveBeenBilled,
    ...details,
  });
}

interface DocumentRetrievalTurnResult {
  evidence: readonly RetrievalEvidence[];
  outcome: CopilotRetrievalOutcome;
}

const accessDenialReasons = new Set<RetrievalRejectionReason>([
  "missing-principal",
  "missing-tenant",
  "tenant-mismatch",
  "missing-policy-version",
  "stale-policy-version",
  "missing-access-scope",
  "missing-access-metadata",
  "principal-not-allowed",
  "group-not-allowed",
  "application-not-entitled",
  "authorization-error",
]);

function retrievalCitation(evidence: RetrievalEvidence): CopilotCitation {
  return {
    citationId: evidence.citationId,
    kind: "retrieval-document",
    label: `Retrieved ${evidence.sourceApplication} document ${evidence.sourceReference.nativeDocumentId} (revision ${evidence.revision})`,
    source: evidence.sourceApplication,
    nativeId: evidence.sourceReference.nativeDocumentId,
  };
}

function contextBudgetError(): Error {
  const error = new Error("Context budget exceeded: protected graph context exceeds the existing character limit.");
  error.name = "ContextBudgetExceededError";
  return error;
}

async function retrieveDocumentEvidenceForTurn(
  message: string,
  contextPacket: CopilotContextPacket,
  requestId: string,
): Promise<DocumentRetrievalTurnResult> {
  let candidateCount = 0;
  let deniedCount = 0;
  try {
    const runtime = getDocumentRetrievalRuntime();
    if (!runtime)
      return { evidence: [], outcome: { reasonCode: "retrieval-dependency-unavailable" } };
    if (!runtime.enabled)
      return { evidence: [], outcome: { reasonCode: "retrieval-disabled" } };
    if (!runtime.principal)
      return { evidence: [], outcome: { reasonCode: "retrieval-principal-unavailable" } };
    if (!runtime.index || !runtime.accessPolicy || !runtime.diagnosticsStore)
      return { evidence: [], outcome: { reasonCode: "retrieval-dependency-unavailable" } };

    const relationshipEndpointEntityIds = contextPacket.relationships.flatMap((relationship) => [
      relationship.sourceEntityId,
      relationship.targetEntityId,
    ]);
    const relevantEntityIds = new Set([...contextPacket.selectedEntityIds, ...relationshipEndpointEntityIds]);
    const sourceApplicationFilters = contextPacket.entities
      .flatMap((entity) =>
        relevantEntityIds.has(entity.entityId) && entity.source ? [entity.source] : [],
      );
    const query = buildRetrievalQuery({
      originalQuestion: message,
      intent: contextPacket.questionIntent,
      investigationId: String(contextPacket.investigationId),
      canonicalSubjectIds: contextPacket.reasoningPackage.subjectApplicationParticipation.map((item) => item.subjectId),
      selectedEntityIds: contextPacket.selectedEntityIds,
      relationshipEndpointEntityIds,
      sourceApplicationFilters,
      documentTypeFilters: [],
      requestedTopK: 10,
    }, runtime.principal);
    if (!query)
      return { evidence: [], outcome: { reasonCode: "retrieval-principal-unavailable" } };

    let retrievalDiagnostics: RetrievalDiagnostics | undefined;
    const result = await retrieveEvidence({
      query,
      index: runtime.index,
      accessPolicy: runtime.accessPolicy,
      diagnosticsStore: {
        persist: async (diagnostics) => {
          retrievalDiagnostics = diagnostics;
        },
      },
      requestId,
      snapshotRevision: contextPacket.snapshotRevision,
    });
    if (!retrievalDiagnostics) throw new Error("Retrieval diagnostics were not produced.");
    candidateCount = result.diagnostics.candidateCount;
    deniedCount = result.diagnostics.rejectedCandidates
      .filter((rejection) => accessDenialReasons.has(rejection.reasonCode)).length;
    if (result.status === "authorization-failed") {
      await runtime.diagnosticsStore.persist(retrievalDiagnostics);
      return {
        evidence: [],
        outcome: {
          reasonCode: "retrieval-access-denied",
          candidateCount,
          allowedCount: 0,
          deniedCount,
          selectedCount: 0,
          contextCharacters: 0,
        },
      };
    }
    if (!result.evidence.length) {
      await runtime.diagnosticsStore.persist(retrievalDiagnostics);
      return {
        evidence: [],
        outcome: {
          reasonCode: deniedCount ? "retrieval-access-denied" : "retrieval-no-evidence",
          candidateCount,
          allowedCount: 0,
          deniedCount,
          selectedCount: 0,
          contextCharacters: 0,
        },
      };
    }

    const graphPayload = engineeringPromptPayload(message, contextPacket);
    const retrievalSectionOverhead =
      JSON.stringify({ retrievedDocumentEvidence: { authority: "retrieved-document", evidence: [] } }).length - 3;
    const budget = allocateRetrievalBudget({
      protectedCharacters: JSON.stringify(graphPayload).length + retrievalSectionOverhead,
      evidence: result.evidence,
    });
    const evidence = budget.evidence;
    await runtime.diagnosticsStore.persist({
      ...retrievalDiagnostics,
      selectedCount: evidence.length,
      selectedChunkIds: evidence.map((item) => item.chunkId),
      contextCharactersConsumed: budget.retrievalCharactersConsumed,
      omissionReasonCodes: [
        ...new Set([
          ...retrievalDiagnostics.omissionReasonCodes,
          ...budget.omissionReasonCodes,
        ]),
      ],
    });
    if (budget.budgetExceeded) throw contextBudgetError();
    return {
      evidence,
      outcome: {
        reasonCode: evidence.length ? "retrieval-succeeded" : "retrieval-budget-omitted",
        candidateCount,
        allowedCount: result.evidence.length,
        deniedCount,
        selectedCount: evidence.length,
        contextCharacters: budget.retrievalCharactersConsumed,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === "ContextBudgetExceededError") throw error;
    return {
      evidence: [],
      outcome: {
        reasonCode: "retrieval-failed",
        ...(candidateCount ? { candidateCount } : {}),
        ...(deniedCount ? { deniedCount } : {}),
        allowedCount: 0,
        selectedCount: 0,
        contextCharacters: 0,
      },
    };
  }
}

export async function executeCopilotTurn(command: CopilotTurnCommand): Promise<CopilotTurnOutcome> {
  const tracker: TurnTracker = {
    requestId: /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(command.idempotencyKey)
      ? command.idempotencyKey
      : randomUUID(),
    investigationId: command.investigationId,
    threadId: command.threadId,
    snapshotRevision: command.expectedSnapshotRevision,
    failingStage: "turn-started",
    requestMayHaveBeenBilled: false,
  };
  await journalTurnStage(tracker, "turn-started");
  try {
    const outcome = await executeCopilotTurnInternal(command, tracker);
    if (outcome.ok) {
      tracker.threadId = outcome.threadId;
      tracker.snapshotRevision = outcome.snapshotRevision;
      await journalTurnStage(tracker, "turn-completed");
    } else {
      const failingStage = tracker.failingStage;
      const validationCategory = isFailureCategory(outcome.body.validationCategory)
        ? outcome.body.validationCategory
        : isFailureCategory(outcome.body.failureCode) ? outcome.body.failureCode : undefined;
      await journalTurnStage(tracker, "turn-failed", {
        failureCode: typeof outcome.body.failureCode === "string" ? outcome.body.failureCode : validationCategory ?? "unknown-runtime-error",
        validationCategory,
        providerStatus: typeof outcome.body.providerStatus === "number" ? outcome.body.providerStatus : tracker.providerStatus,
        error: outcome.cause,
        retryable: outcome.body.retryable === true,
        requestMayHaveBeenBilled: outcome.body.requestMayHaveBeenBilled === true || tracker.requestMayHaveBeenBilled,
      });
      outcome.body.failingStage ??= failingStage;
      outcome.body.requestId ??= tracker.requestId;
      outcome.body.failureCode ??= validationCategory ?? "unknown-runtime-error";
      outcome.body.requestMayHaveBeenBilled ??= tracker.requestMayHaveBeenBilled;
      outcome.body.retryable ??= false;
    }
    return outcome;
  } catch (cause) {
    if (cause instanceof TurnStageError) tracker.failingStage = cause.stage;
    const failingStage = tracker.failingStage;
    const category: CopilotFailureCategory = cause instanceof TurnStageError
      ? cause.category
      : tracker.failingStage === "conversation-persisted"
      ? "conversation-persistence"
      : cause instanceof Error && cause.name === "ContextBudgetExceededError"
        ? "context-budget"
        : tracker.failingStage === "provider-request-started" || tracker.failingStage === "provider-response-received"
          ? providerFailureCategory(cause)
          : "unknown-runtime-error";
    await journalTurnStage(tracker, "turn-failed", {
      failureCode: category,
      validationCategory: category,
      providerStatus: tracker.providerStatus,
      error: cause,
      requestMayHaveBeenBilled: tracker.requestMayHaveBeenBilled,
      retryable: false,
    });
    return failure(502, "Copilot could not complete a validated answer. Check the stage details before retrying.", {
      requestId: tracker.requestId,
      failureCode: category,
      failingStage,
      ...(tracker.providerStatus !== undefined ? { providerStatus: tracker.providerStatus } : {}),
      validationCategory: category,
      requestMayHaveBeenBilled: tracker.requestMayHaveBeenBilled,
      retryable: false,
    }, cause);
  }
}

async function executeCopilotTurnInternal(command: CopilotTurnCommand, tracker: TurnTracker): Promise<CopilotTurnOutcome> {
  const {
    investigationId,
    expectedSnapshotRevision,
    idempotencyKey,
    message,
    signal,
  } = command;
  if (!message.trim() || message.length > 2_000 || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(idempotencyKey))
    return failure(400, "Copilot message or request identifier is invalid.", {
      failureCode: "unknown-runtime-error",
      failingStage: tracker.failingStage,
      requestMayHaveBeenBilled: false,
      retryable: false,
    });

  const snapshot = await loadSnapshot(investigationId);
  if (!snapshot) return failure(404, "Investigation was not found.", { failureCode: "unknown-runtime-error" });
  tracker.snapshotRevision = snapshot.identity.revision;
  if (snapshot.archivedAt) return failure(409, "Restore the investigation before adding copilot messages.", { failureCode: "unknown-runtime-error" });
  if (snapshot.identity.revision !== expectedSnapshotRevision)
    return failure(409, "The investigation changed before the message could be saved.", {
      revision: snapshot.identity.revision,
      failureCode: "snapshot-validation",
      validationCategory: "snapshot-validation",
    });

  let contextSnapshot: InvestigationSnapshot;
  tracker.failingStage = "context-built";
  try {
    contextSnapshot = ensureInvestigationKnowledgeGraph(snapshot);
  } catch (cause) {
    return failure(503, "The authoritative relationship ontology is unavailable. Copilot cannot safely answer this request.", {
      failureCode: "unknown-runtime-error",
      validationCategory: "unknown-runtime-error",
      failingStage: "context-built",
      requestMayHaveBeenBilled: false,
      retryable: false,
    }, cause);
  }

  let threadId = command.threadId ?? randomUUID();
  tracker.threadId = threadId;
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
  tracker.threadId = threadId;
  tracker.failingStage = "context-built";
  const contextPacket: CopilotContextPacket = buildInvestigationContext(contextSnapshot, message);
  tracker.snapshotRevision = contextPacket.snapshotRevision;
  await journalTurnStage(tracker, "context-built");
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
    tracker.failingStage = "answer-validated";
    await journalTurnStage(tracker, "answer-validated");
    tracker.failingStage = "conversation-persisted";
    const completed = await store.appendTurn(investigationId, threadId, stagedThread.threadRevision, message, {
      answer: validatedAnswer,
      at: new Date().toISOString(),
      snapshotRevision: snapshot.identity.revision,
      idempotencyKey,
    });
    await journalTurnStage(tracker, "conversation-persisted");
    const assistant = completed.messages.at(-1);
    if (!assistant || assistant.role !== "assistant")
      return failure(503, "Clarification response was not persisted. Do not retry automatically.", {
        failureCode: "conversation-persistence",
        validationCategory: "conversation-persistence",
        failingStage: "conversation-persisted",
        requestMayHaveBeenBilled: false,
        retryable: false,
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

  let retrievedDocumentEvidence: readonly RetrievalEvidence[] = [];
  let retrievalCitations: readonly CopilotCitation[] = [];
  if (contextPacket.questionIntent === "document") {
    const retrieval = await retrieveDocumentEvidenceForTurn(message, contextPacket, idempotencyKey);
    retrievedDocumentEvidence = retrieval.evidence;
    retrievalCitations = retrieval.evidence.map(retrievalCitation);
    await journalTurnStage(tracker, "retrieval-completed", { retrievalOutcome: retrieval.outcome });
  }

  if (contextPacket.retrievalConfidence.belowThreshold && !retrievedDocumentEvidence.length) {
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
    let preparedAnswer: unknown;
    try {
      preparedAnswer = ensureEngineeringAnswerCoverage(
        answer,
        contextPacket.engineeringBrief,
        contextPacket.citations,
        contextPacket.questionIntent === "summary",
        contextPacket.questionIntent,
        contextPacket,
      );
    } catch (cause) {
      throw new TurnStageError("answer-coverage", "answer-validated", cause);
    }
    const validatedAnswer = validateCopilotAnswer(preparedAnswer, contextPacket);
    tracker.failingStage = "answer-validated";
    await journalTurnStage(tracker, "answer-validated");
    tracker.failingStage = "conversation-persisted";
    const completed = await store.appendTurn(investigationId, threadId, stagedThread.threadRevision, message, {
      answer: validatedAnswer,
      at: new Date().toISOString(),
      snapshotRevision: snapshot.identity.revision,
      idempotencyKey,
    });
    await journalTurnStage(tracker, "conversation-persisted");
    const assistant = completed.messages.at(-1);
    if (!assistant || assistant.role !== "assistant")
      return failure(503, "Low-confidence response was not persisted. Do not retry automatically.", {
        failureCode: "conversation-persistence",
        validationCategory: "conversation-persistence",
        failingStage: "conversation-persisted",
        requestMayHaveBeenBilled: false,
        retryable: false,
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

  let providerResponse;
  let request: AzureChatRequest;
  const m2PromptCitationIds = contextPacket.consequenceEvidenceState
    ? contextPacket.citations.map((citation) => citation.citationId).slice(0, 100)
    : undefined;
  tracker.failingStage = "prompt-built";
  try {
    const userPayload = engineeringPromptPayload(message, contextPacket, retrievedDocumentEvidence);
    request = {
      requestId: idempotencyKey,
      turnContext: {
        investigationId: String(investigationId),
        threadId,
        snapshotRevision: contextPacket.snapshotRevision,
      },
      messages: [
        { role: "system", content: `${COPILOT_SYSTEM_POLICY}\nPolicy version: ${COPILOT_POLICY_VERSION}\n${answerFormat(contextPacket.snapshotRevision, contextPacket.questionIntent, contextPacket.consequenceEvidenceState)}` },
        ...history,
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      maxTokens: 2_000,
      temperature: 0.1,
      ...(signal ? { signal } : {}),
    };
    await journalTurnStage(tracker, "prompt-built", {
      ...(m2PromptCitationIds ? { promptCitationIds: m2PromptCitationIds } : {}),
    });
    tracker.requestMayHaveBeenBilled = true;
    await journalTurnStage(tracker, "provider-request-started", { requestMayHaveBeenBilled: true });
    providerResponse = await completeCopilotTurn(request);
  } catch (cause) {
    const errorValue = cause && typeof cause === "object" ? cause as { code?: unknown; status?: unknown } : undefined;
    const providerStatus = typeof errorValue?.status === "number" ? errorValue.status : undefined;
    const hasProviderErrorCode = typeof errorValue?.code === "string";
    const category = hasProviderErrorCode
      ? providerFailureCategory(cause)
      : cause instanceof Error && cause.name === "ContextBudgetExceededError"
        ? "context-budget"
        : "unknown-runtime-error";
    tracker.providerStatus = providerStatus;
    if (providerStatus !== undefined) {
      await journalTurnStage(tracker, "provider-response-received", {
        providerStatus,
        failureCode: category,
        validationCategory: category,
        error: cause,
        requestMayHaveBeenBilled: true,
        retryable: false,
      });
    }
    return failure(502, providerStatus !== undefined && errorValue?.code === "provider-http-error"
      ? `Copilot could not complete the provider request (HTTP ${providerStatus}). Do not retry automatically.`
      : providerStatus !== undefined
        ? "Copilot received an unusable provider response. Do not retry automatically."
        : "Copilot could not complete the request. Do not retry automatically.", {
      requestId: tracker.requestId,
      failureCode: category,
      failingStage: providerStatus !== undefined
        ? "provider-response-received"
        : tracker.failingStage,
      validationCategory: category,
      ...(providerStatus !== undefined ? { providerStatus } : {}),
      retryable: false,
      requestMayHaveBeenBilled: errorValue?.code === "invalid-configuration"
        ? false
        : tracker.requestMayHaveBeenBilled,
      investigationId,
      threadId,
      threadRevision: stagedThread.threadRevision,
      idempotencyKey,
    }, cause);
  }

  tracker.providerStatus = providerResponse.providerStatus;
  await journalTurnStage(tracker, "provider-response-received", {
    providerStatus: providerResponse.providerStatus,
    requestMayHaveBeenBilled: true,
  });

  let parsedAnswer: unknown;
  try {
    parsedAnswer = parseModelAnswer(providerResponse.content);
    await journalTurnStage(tracker, "provider-response-parsed", {
      responseCharacterCount: providerResponse.content.length,
      jsonParsingResult: "passed",
      ...(contextPacket.consequenceEvidenceState ? { providerCitationIds: providerCitationIds(parsedAnswer) } : {}),
      topLevelKeys: parsedAnswer && typeof parsedAnswer === "object" && !Array.isArray(parsedAnswer)
        ? Object.keys(parsedAnswer)
        : [],
    });
  } catch (cause) {
    const category = validationFailureCategory(cause);
    await journalTurnStage(tracker, "provider-response-parsed", {
      responseCharacterCount: providerResponse.content.length,
      jsonParsingResult: "failed",
      failureCode: category,
      validationCategory: category,
      error: new Error("Provider answer content is not valid JSON."),
      requestMayHaveBeenBilled: true,
      retryable: false,
    });
    throw new TurnStageError(category, "provider-response-parsed", cause);
  }

  let repairedAnswer: unknown;
  let consequenceRepair = {
    answer: undefined as unknown,
    repairApplied: false,
    removedCitationIds: [] as string[],
    removedClaimCategories: [] as string[],
    unknownCitationIds: [] as string[],
  };
  try {
    repairedAnswer = repairProviderAnswer(parsedAnswer);
    if (contextPacket.consequenceEvidenceState) {
      consequenceRepair = repairConsequenceAnswer(repairedAnswer, contextPacket);
      repairedAnswer = consequenceRepair.answer;
    }
    await journalTurnStage(tracker, "answer-repaired", {
      responseCharacterCount: providerResponse.content.length,
      jsonParsingResult: "passed",
      ...(contextPacket.consequenceEvidenceState ? {
        promptCitationIds: m2PromptCitationIds,
        providerCitationIds: providerCitationIds(parsedAnswer),
        unknownCitationIds: consequenceRepair.unknownCitationIds,
        uncitedFactualClaimCount: providerUncitedFactualClaimCount(parsedAnswer),
        claimRequirements: providerClaimRequirements(parsedAnswer),
        repairApplied: consequenceRepair.repairApplied,
        removedCitationIds: consequenceRepair.removedCitationIds,
        removedClaimCategories: consequenceRepair.removedClaimCategories,
        fallbackUsed: false,
      } : {}),
      topLevelKeys: repairedAnswer && typeof repairedAnswer === "object" && !Array.isArray(repairedAnswer)
        ? Object.keys(repairedAnswer)
        : [],
    });
  } catch (cause) {
    throw new TurnStageError("response-shape", "answer-repaired", cause);
  }

  let modelAnswer: unknown;
  try {
    modelAnswer = ensureEngineeringAnswerCoverage(
      repairedAnswer,
      contextPacket.engineeringBrief,
      contextPacket.citations,
      contextPacket.questionIntent === "summary",
      contextPacket.questionIntent,
      contextPacket,
    );
  } catch (cause) {
    throw new TurnStageError("answer-coverage", "answer-validated", cause);
  }

  let validatedAnswer: CopilotAnswer;
  const validationDiagnostics: CopilotValidationDiagnostics | undefined =
    contextPacket.consequenceEvidenceState ? {
      promptCitationIds: [],
      providerCitationIds: [],
      unknownCitationIds: [],
      uncitedFactualClaimCount: 0,
      claimRequirements: [],
      validationOutcome: "failed",
    } : undefined;
  try {
    validatedAnswer = validateCopilotAnswer(modelAnswer, contextPacket, validationDiagnostics, retrievalCitations);
  } catch (cause) {
    const category = validationFailureCategory(cause);
    const unknownCitationIds = [...new Set([
      ...(validationDiagnostics?.unknownCitationIds ?? []),
      ...consequenceRepair.unknownCitationIds,
    ])].slice(0, 100);
    console.error("[copilot] provider validation failure", {
      category,
      investigationId,
      threadId,
      snapshotRevision: contextPacket.snapshotRevision,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    await journalTurnStage(tracker, "answer-validated", {
      responseCharacterCount: providerResponse.content.length,
      jsonParsingResult: "passed",
      failureCode: category,
      validationCategory: category,
      ...(validationDiagnostics ? {
        promptCitationIds: m2PromptCitationIds,
        providerCitationIds: providerCitationIds(parsedAnswer),
        unknownCitationIds,
        uncitedFactualClaimCount: providerUncitedFactualClaimCount(parsedAnswer),
        claimRequirements: providerClaimRequirements(parsedAnswer),
        validationOutcome: "failed" as const,
        repairApplied: consequenceRepair.repairApplied,
        removedCitationIds: consequenceRepair.removedCitationIds,
        removedClaimCategories: consequenceRepair.removedClaimCategories,
        fallbackUsed: false,
        finalValidationCategory: category,
      } : {}),
      error: cause,
      requestMayHaveBeenBilled: true,
      retryable: false,
    });
    return failure(502, "Copilot returned an answer that could not be validated. No assistant turn was saved.", {
      requestId: tracker.requestId,
      failureCode: category,
      failingStage: "answer-validated",
      validationIssue: `Provider response failed ${category}.`,
      validationCategory: category,
      providerStatus: tracker.providerStatus,
      investigationId,
      threadId,
      threadRevision: stagedThread.threadRevision,
      idempotencyKey,
      retryable: false,
      requestMayHaveBeenBilled: true,
    }, cause);
  }

  tracker.failingStage = "answer-validated";
  await journalTurnStage(tracker, "answer-validated", {
    responseCharacterCount: providerResponse.content.length,
    jsonParsingResult: "passed",
    ...(validationDiagnostics ? {
      promptCitationIds: m2PromptCitationIds,
      providerCitationIds: providerCitationIds(parsedAnswer),
      unknownCitationIds: [...new Set([
        ...validationDiagnostics.unknownCitationIds,
        ...consequenceRepair.unknownCitationIds,
      ])].slice(0, 100),
      uncitedFactualClaimCount: providerUncitedFactualClaimCount(parsedAnswer),
      claimRequirements: providerClaimRequirements(parsedAnswer),
      validationOutcome: "passed" as const,
      repairApplied: consequenceRepair.repairApplied,
      removedCitationIds: consequenceRepair.removedCitationIds,
      removedClaimCategories: consequenceRepair.removedClaimCategories,
      fallbackUsed: false,
      finalValidationCategory: null,
    } : {}),
    requestMayHaveBeenBilled: true,
  });
  tracker.failingStage = "conversation-persisted";
  const completed = await store.appendTurn(investigationId, threadId, stagedThread.threadRevision, message, {
    answer: validatedAnswer,
    at: new Date().toISOString(),
    snapshotRevision: snapshot.identity.revision,
    idempotencyKey,
  });
  await journalTurnStage(tracker, "conversation-persisted", { requestMayHaveBeenBilled: true });
  const assistant = completed.messages.at(-1);
  if (!assistant || assistant.role !== "assistant")
    return failure(503, "Validated assistant turn was not persisted. Do not retry automatically.", {
      requestId: tracker.requestId,
      failureCode: "conversation-persistence",
      failingStage: "conversation-persisted",
      validationCategory: "conversation-persistence",
      retryable: false,
      requestMayHaveBeenBilled: true,
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