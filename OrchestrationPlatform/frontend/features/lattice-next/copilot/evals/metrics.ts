import type { CopilotAnswer, CopilotContextPacket } from "../contracts";

export interface CopilotEvaluationRun {
  expectedInvestigationId: string;
  actualInvestigationId: string;
  answer?: CopilotAnswer;
  context: CopilotContextPacket;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  inputCostPerMillionTokensUsd?: number;
  outputCostPerMillionTokensUsd?: number;
  maxLatencyMs: number;
  maxTotalTokens: number;
  maxEstimatedCostUsd?: number;
  uncertaintyExpected: boolean;
  requiredRelationshipCitationIds?: readonly string[];
}

export interface CopilotEvaluationMetrics {
  citationPrecision: number;
  unsupportedClaimRate: number;
  requiredPathCitationCoverage?: number;
  correctUncertainty: boolean;
  investigationIsolation: boolean;
  latencyMs: number;
  withinLatencyBudget: boolean;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  withinTokenBudget: boolean;
  estimatedCostUsd?: number;
  withinCostBudget: boolean;
}

export function scoreCopilotEvaluation(run: CopilotEvaluationRun): CopilotEvaluationMetrics {
  const available = new Set(run.context.citations.map((citation) => citation.citationId));
  const factualClaims = run.answer?.claims.filter((claim) => claim.kind === "fact") ?? [];
  const usedCitationIds = [
    ...factualClaims.flatMap((claim) => claim.citationIds),
    ...(run.answer?.recommendations.flatMap((recommendation) => recommendation.citationIds) ?? []),
  ];
  const requiredRelationshipCitationIds = run.requiredRelationshipCitationIds === undefined
    ? undefined
    : [...new Set(run.requiredRelationshipCitationIds)];
  const requiredPathCitationCoverage = requiredRelationshipCitationIds === undefined
    ? undefined
    : requiredRelationshipCitationIds.length === 0
      ? 1
      : requiredRelationshipCitationIds.filter((citationId) => usedCitationIds.includes(citationId)).length / requiredRelationshipCitationIds.length;
  const validCitationCount = usedCitationIds.filter((citationId) => available.has(citationId)).length;
  const unsupportedClaimCount = factualClaims.filter((claim) =>
    claim.citationIds.length === 0 || claim.citationIds.some((citationId) => !available.has(citationId)),
  ).length;
  const answerHasUncertainty = Boolean(run.answer?.uncertainties.length);
  const totalTokens = run.promptTokens !== undefined && run.completionTokens !== undefined
    ? run.promptTokens + run.completionTokens
    : undefined;
  const hasRates = run.inputCostPerMillionTokensUsd !== undefined && run.outputCostPerMillionTokensUsd !== undefined;
  const estimatedCostUsd = hasRates && run.promptTokens !== undefined && run.completionTokens !== undefined
    ? (run.promptTokens * run.inputCostPerMillionTokensUsd! + run.completionTokens * run.outputCostPerMillionTokensUsd!) / 1_000_000
    : undefined;

  return {
    citationPrecision: usedCitationIds.length ? validCitationCount / usedCitationIds.length : factualClaims.length ? 0 : 1,
    unsupportedClaimRate: factualClaims.length ? unsupportedClaimCount / factualClaims.length : 0,
    ...(requiredPathCitationCoverage !== undefined ? { requiredPathCitationCoverage } : {}),
    correctUncertainty: run.uncertaintyExpected === answerHasUncertainty,
    investigationIsolation: run.expectedInvestigationId === run.actualInvestigationId && run.context.investigationId === run.expectedInvestigationId,
    latencyMs: Math.max(0, Math.round(run.latencyMs)),
    withinLatencyBudget: run.latencyMs <= run.maxLatencyMs,
    ...(run.promptTokens !== undefined ? { promptTokens: run.promptTokens } : {}),
    ...(run.completionTokens !== undefined ? { completionTokens: run.completionTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    withinTokenBudget: totalTokens !== undefined && totalTokens <= run.maxTotalTokens,
    ...(estimatedCostUsd !== undefined ? { estimatedCostUsd } : {}),
    withinCostBudget: run.maxEstimatedCostUsd !== undefined && estimatedCostUsd !== undefined && estimatedCostUsd <= run.maxEstimatedCostUsd,
  };
}

export function summarizeCopilotEvaluation(metrics: readonly CopilotEvaluationMetrics[]) {
  if (!metrics.length) return { caseCount: 0, meanCitationPrecision: 0, unsupportedClaimRate: 0, uncertaintyPassRate: 0, isolationPassRate: 0, latencyPassRate: 0, tokenBudgetPassRate: 0, costBudgetPassRate: 0 };
  const average = (select: (item: CopilotEvaluationMetrics) => number) => metrics.reduce((sum, item) => sum + select(item), 0) / metrics.length;
  return {
    caseCount: metrics.length,
    meanCitationPrecision: average((item) => item.citationPrecision),
    unsupportedClaimRate: average((item) => item.unsupportedClaimRate),
    uncertaintyPassRate: average((item) => Number(item.correctUncertainty)),
    isolationPassRate: average((item) => Number(item.investigationIsolation)),
    latencyPassRate: average((item) => Number(item.withinLatencyBudget)),
    tokenBudgetPassRate: average((item) => Number(item.withinTokenBudget)),
    costBudgetPassRate: average((item) => Number(item.withinCostBudget)),
  };
}
