import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import type { RetrievalOutcomeReasonCode } from "./retrieval/retrieval-runtime";

export type CopilotTurnStage =
  | "turn-started"
  | "context-built"
  | "retrieval-completed"
  | "prompt-built"
  | "provider-request-started"
  | "provider-response-received"
  | "provider-response-parsed"
  | "answer-repaired"
  | "answer-validated"
  | "conversation-persisted"
  | "turn-completed"
  | "turn-failed";

export type CopilotFailureCategory =
  | "malformed-json"
  | "schema-validation"
  | "response-shape"
  | "citation-validation"
  | "snapshot-validation"
  | "answer-coverage"
  | "conversation-persistence"
  | "context-budget"
  | "provider-http-error"
  | "provider-network-error"
  | "usage-ledger-error"
  | "unknown-runtime-error";

export interface CopilotTurnStageRecord {
  timestamp: string;
  requestId: string;
  investigationId: string;
  threadId: string | null;
  snapshotRevision: number | null;
  stage: CopilotTurnStage;
  providerStatus: number | null;
  failureCode: string | null;
  validationCategory: CopilotFailureCategory | null;
  errorName: string | null;
  errorMessage: string | null;
  requestMayHaveBeenBilled: boolean;
  retryable: boolean;
  responseCharacterCount?: number;
  jsonParsingResult?: "passed" | "failed";
  topLevelKeys?: string[];
  promptCitationIds?: string[];
  providerCitationIds?: string[];
  unknownCitationIds?: string[];
  uncitedFactualClaimCount?: number;
  claimRequirements?: { claimType: string; requiredCitationType: string }[];
  validationOutcome?: "passed" | "failed";
  repairApplied?: boolean;
  fallbackUsed?: boolean;
  removedCitationIds?: string[];
  removedClaimCategories?: string[];
  finalValidationCategory?: CopilotFailureCategory | null;
  retrievalOutcome?: CopilotRetrievalOutcome;
}

export interface CopilotRetrievalOutcome {
  reasonCode: RetrievalOutcomeReasonCode;
  candidateCount?: number;
  allowedCount?: number;
  deniedCount?: number;
  selectedCount?: number;
  contextCharacters?: number;
}

export interface CopilotTurnStageInput extends Partial<Omit<CopilotTurnStageRecord,
  "timestamp" | "requestId" | "investigationId" | "threadId" | "snapshotRevision" | "stage" |
  "providerStatus" | "failureCode" | "validationCategory" | "errorName" | "errorMessage" |
  "requestMayHaveBeenBilled" | "retryable">> {
  requestId: string;
  investigationId: string;
  threadId?: string;
  snapshotRevision?: number;
  stage: CopilotTurnStage;
  providerStatus?: number;
  failureCode?: string;
  validationCategory?: CopilotFailureCategory;
  error?: unknown;
  requestMayHaveBeenBilled?: boolean;
  retryable?: boolean;
}

function boundedCount(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isSafeInteger(value) || value < 0) return undefined;
  return Math.min(value, 1_000_000);
}

function sanitizedRetrievalOutcome(value: CopilotRetrievalOutcome): CopilotRetrievalOutcome {
  const candidateCount = boundedCount(value.candidateCount);
  const allowedCount = boundedCount(value.allowedCount);
  const deniedCount = boundedCount(value.deniedCount);
  const selectedCount = boundedCount(value.selectedCount);
  const contextCharacters = boundedCount(value.contextCharacters);
  return {
    reasonCode: value.reasonCode,
    ...(candidateCount !== undefined ? { candidateCount } : {}),
    ...(allowedCount !== undefined ? { allowedCount } : {}),
    ...(deniedCount !== undefined ? { deniedCount } : {}),
    ...(selectedCount !== undefined ? { selectedCount } : {}),
    ...(contextCharacters !== undefined ? { contextCharacters } : {}),
  };
}

function safeText(value: string, maximum = 512): string {
  return value
    .replace(/(api[-_ ]?key|authorization|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\b[A-Z]:\\(?:[^\s\\]+\\)*[^\s\\]*/gi, "[redacted-path]")
    .replace(/\{[^}]*\}/g, "[redacted-details]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, maximum);
}

function errorDetails(error: unknown): { name: string | null; message: string | null } {
  if (error === undefined || error === null) return { name: null, message: null };
  if (error instanceof Error) {
    return {
      name: safeText(error.name, 100),
      message: safeText(error.message),
    };
  }
  return { name: typeof error, message: safeText(String(error)) };
}

let pendingWrite: Promise<void> = Promise.resolve();

export function recordCopilotTurnStage(input: CopilotTurnStageInput): Promise<void> {
  const details = errorDetails(input.error);
  const record: CopilotTurnStageRecord = {
    timestamp: new Date().toISOString(),
    requestId: safeText(input.requestId, 128),
    investigationId: safeText(input.investigationId, 128),
    threadId: input.threadId ? safeText(input.threadId, 128) : null,
    snapshotRevision: Number.isSafeInteger(input.snapshotRevision) ? input.snapshotRevision! : null,
    stage: input.stage,
    providerStatus: input.providerStatus ?? null,
    failureCode: input.failureCode ? safeText(input.failureCode, 100) : null,
    validationCategory: input.validationCategory ?? null,
    errorName: details.name,
    errorMessage: details.message,
    requestMayHaveBeenBilled: input.requestMayHaveBeenBilled ?? false,
    retryable: input.retryable ?? false,
    ...(input.responseCharacterCount !== undefined ? { responseCharacterCount: input.responseCharacterCount } : {}),
    ...(input.jsonParsingResult ? { jsonParsingResult: input.jsonParsingResult } : {}),
    ...(input.topLevelKeys ? { topLevelKeys: input.topLevelKeys.slice(0, 40).map((key) => safeText(key, 100)) } : {}),
    ...(input.promptCitationIds ? { promptCitationIds: input.promptCitationIds.slice(0, 100).map((id) => safeText(id, 512)) } : {}),
    ...(input.providerCitationIds ? { providerCitationIds: input.providerCitationIds.slice(0, 100).map((id) => safeText(id, 512)) } : {}),
    ...(input.unknownCitationIds ? { unknownCitationIds: input.unknownCitationIds.slice(0, 100).map((id) => safeText(id, 512)) } : {}),
    ...(input.uncitedFactualClaimCount !== undefined ? { uncitedFactualClaimCount: input.uncitedFactualClaimCount } : {}),
    ...(input.claimRequirements ? {
      claimRequirements: input.claimRequirements.slice(0, 100).map((item) => ({
        claimType: safeText(item.claimType, 100),
        requiredCitationType: safeText(item.requiredCitationType, 200),
      })),
    } : {}),
    ...(input.validationOutcome ? { validationOutcome: input.validationOutcome } : {}),
    ...(input.repairApplied !== undefined ? { repairApplied: input.repairApplied } : {}),
    ...(input.fallbackUsed !== undefined ? { fallbackUsed: input.fallbackUsed } : {}),
    ...(input.removedCitationIds ? { removedCitationIds: input.removedCitationIds.slice(0, 100).map((id) => safeText(id, 512)) } : {}),
    ...(input.removedClaimCategories ? { removedClaimCategories: input.removedClaimCategories.slice(0, 100).map((category) => safeText(category, 100)) } : {}),
    ...(input.finalValidationCategory !== undefined ? { finalValidationCategory: input.finalValidationCategory } : {}),
    ...(input.stage === "retrieval-completed" && input.retrievalOutcome
      ? { retrievalOutcome: sanitizedRetrievalOutcome(input.retrievalOutcome) }
      : {}),
  };
  const configuredPath = process.env.LATTICE_COPILOT_STAGE_LOG_PATH?.trim();
  const filePath = path.resolve(configuredPath || path.join(process.cwd(), ".lattice-data", "copilot-turn-stages.jsonl"));
  const write = pendingWrite.then(async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
  });
  pendingWrite = write.catch((error: unknown) => {
    const details = errorDetails(error);
    console.error("[copilot] turn-stage journal write failed", details);
  });
  return pendingWrite;
}
