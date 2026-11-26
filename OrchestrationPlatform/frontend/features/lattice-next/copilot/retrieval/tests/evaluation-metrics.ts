import type { RetrievalSearchResult } from "../contracts";
import type { RetrievalBudgetResult } from "../allocate-retrieval-budget";

export interface RetrievalEvaluationClaim {
  readonly citationIds: readonly string[];
}

export interface RetrievalEvaluationMetricsInput {
  readonly expectedRelevantChunkIds: readonly string[];
  readonly expectedSubjectIds: readonly string[];
  readonly expectedApplications: readonly string[];
  readonly requiredCitationIds: readonly string[];
  readonly claims: readonly RetrievalEvaluationClaim[];
  readonly forbiddenChunkIds: readonly string[];
  readonly forbiddenText: readonly string[];
  readonly result: RetrievalSearchResult;
  readonly budget: RetrievalBudgetResult;
  readonly hardLimit: number;
  readonly retrievalLatencyMs: number;
}

export interface RetrievalEvaluationMetrics {
  readonly recallAt5: number;
  readonly recallAt10: number;
  readonly meanReciprocalRank: number;
  readonly citationPrecision: number;
  readonly citationCompleteness: number;
  readonly subjectRelevance: number;
  readonly applicationRelevance: number;
  readonly accessFilterCorrectness: number;
  readonly unauthorizedTextLeakageCount: number;
  readonly unsupportedClaimRate: number;
  readonly contextBudgetCompliance: number;
  readonly retrievalLatencyMs: number;
}

function recall(expected: readonly string[], actual: readonly string[]): number {
  if (!expected.length) return 1;
  const found = new Set(actual);
  return expected.filter((id) => found.has(id)).length / new Set(expected).size;
}

function fraction(numerator: number, denominator: number): number {
  return denominator ? numerator / denominator : 1;
}

export function scoreRetrievalEvaluation(input: RetrievalEvaluationMetricsInput): RetrievalEvaluationMetrics {
  const retrieved = input.result.evidence;
  const retrievedIds = retrieved.map((item) => item.chunkId);
  const citations = new Set(retrieved.map((item) => item.citationId));
  const usedCitationIds = input.claims.flatMap((claim) => claim.citationIds);
  const requiredCitationIds = new Set(input.requiredCitationIds);
  const relevantIds = new Set(input.expectedRelevantChunkIds);
  const forbiddenIds = new Set(input.forbiddenChunkIds);
  const serializedResult = JSON.stringify({ evidence: input.result.evidence, diagnostics: input.result.diagnostics });
  const unauthorizedTextLeakageCount = input.forbiddenText.reduce((count, text) =>
    text && serializedResult.includes(text) ? count + 1 : count,
  0);
  const unauthorizedChunkLeaked = retrievedIds.some((id) => forbiddenIds.has(id));
  const selectedSubjectEvidence = retrieved.filter((item) => {
    const chunk = input.result.diagnostics.scoreBreakdowns.find((score) => score.chunkId === item.chunkId);
    return chunk && input.expectedSubjectIds.length > 0 &&
      input.result.evidence.some((evidence) => evidence.chunkId === item.chunkId) &&
      chunk.scores.subjectScore > 0;
  });
  const selectedApplicationEvidence = retrieved.filter((item) =>
    input.expectedApplications.some((application) =>
      application.toLocaleLowerCase("en-US") === item.sourceApplication.toLocaleLowerCase("en-US"),
    ),
  );
  const unsupportedClaims = input.claims.filter((claim) =>
    !claim.citationIds.length || claim.citationIds.some((citationId) => !citations.has(citationId)),
  ).length;
  const firstRelevantRank = retrievedIds.findIndex((id) => relevantIds.has(id));

  return {
    recallAt5: recall(input.expectedRelevantChunkIds, retrievedIds.slice(0, 5)),
    recallAt10: recall(input.expectedRelevantChunkIds, retrievedIds.slice(0, 10)),
    meanReciprocalRank: firstRelevantRank < 0 ? (input.expectedRelevantChunkIds.length ? 0 : 1) : 1 / (firstRelevantRank + 1),
    citationPrecision: fraction(usedCitationIds.filter((citationId) => citations.has(citationId)).length, usedCitationIds.length),
    citationCompleteness: fraction(
      [...requiredCitationIds].filter((citationId) => usedCitationIds.includes(citationId)).length,
      requiredCitationIds.size,
    ),
    subjectRelevance: fraction(selectedSubjectEvidence.length, retrieved.length),
    applicationRelevance: fraction(selectedApplicationEvidence.length, retrieved.length),
    accessFilterCorrectness: Number(!unauthorizedChunkLeaked && unauthorizedTextLeakageCount === 0 &&
      input.result.diagnostics.rejectedCandidates.every((item) => !forbiddenIds.has(item.chunkId) || !retrievedIds.includes(item.chunkId))),
    unauthorizedTextLeakageCount,
    unsupportedClaimRate: input.claims.length ? unsupportedClaims / input.claims.length : 0,
    contextBudgetCompliance: Number(!input.budget.budgetExceeded && input.budget.totalCharacters <= input.hardLimit),
    retrievalLatencyMs: Math.max(0, Math.round(input.retrievalLatencyMs)),
  };
}
