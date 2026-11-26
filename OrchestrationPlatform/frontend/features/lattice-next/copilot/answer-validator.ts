import type { CopilotAnswer, CopilotClaim, CopilotContextPacket, CopilotRecommendation } from "./contracts";

export class CopilotAnswerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CopilotAnswerValidationError";
  }
}

export interface CopilotAnswerValidationOutcome {
  assertionType: "claim" | "recommendation";
  assertionIndex: number;
  accepted: boolean;
  citationIds: readonly string[];
  issue?: string;
}

export type CopilotAnswerValidationObserver = (outcome: CopilotAnswerValidationOutcome) => void;

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new CopilotAnswerValidationError(`${field} must be a non-empty string.`);
  return value.trim();
}

function textArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value))
    throw new CopilotAnswerValidationError(`${field} must be an array.`);
  return value.map((item, index) => requiredText(item, `${field}[${index}]`));
}

function citationIds(value: unknown, field: string, known: ReadonlySet<string>, required: boolean): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw new CopilotAnswerValidationError(`${field} must be an array of citation IDs.`);
  const ids = value as string[];
  if (required && ids.length === 0) throw new CopilotAnswerValidationError(`${field} requires citations from the active snapshot.`);
  if (new Set(ids).size !== ids.length) throw new CopilotAnswerValidationError(`${field} contains duplicate citation IDs.`);
  for (const id of ids) {
    if (!known.has(id)) throw new CopilotAnswerValidationError(`${field} contains an unknown citation ID.`);
  }
  return [...ids];
}

function validateClaim(value: unknown, index: number, known: ReadonlySet<string>): CopilotClaim {
  const item = object(value);
  if (!item) throw new CopilotAnswerValidationError(`claims[${index}] must be an object.`);
  if (item.kind !== "fact" && item.kind !== "hypothesis")
    throw new CopilotAnswerValidationError(`claims[${index}].kind must be fact or hypothesis.`);
  if (item.kind === "fact" && Array.isArray(item.citationIds) && item.citationIds.length === 0)
    throw new CopilotAnswerValidationError(`Factual claims require citations from the active snapshot.`);
  return {
    text: requiredText(item.text, `claims[${index}].text`),
    kind: item.kind,
    citationIds: citationIds(item.citationIds, `claims[${index}].citationIds`, known, item.kind === "fact"),
  };
}

function validateRecommendation(
  value: unknown,
  index: number,
  known: ReadonlySet<string>,
  observe?: CopilotAnswerValidationObserver,
): CopilotRecommendation | undefined {
  const item = object(value);
  try {
    if (!item || item.approvalRequired !== true)
      throw new CopilotAnswerValidationError(`recommendations[${index}] must require engineer approval.`);
    const recommendation = {
      text: requiredText(item.text, `recommendations[${index}].text`),
      rationale: requiredText(item.rationale, `recommendations[${index}].rationale`),
      citationIds: citationIds(item.citationIds, `recommendations[${index}].citationIds`, known, true),
      approvalRequired: true as const,
    };
    observe?.({
      assertionType: "recommendation",
      assertionIndex: index,
      accepted: true,
      citationIds: recommendation.citationIds,
    });
    return recommendation;
  } catch (error) {
    observe?.({
      assertionType: "recommendation",
      assertionIndex: index,
      accepted: false,
      citationIds: Array.isArray(item?.citationIds)
        ? item.citationIds.filter((citationId): citationId is string => typeof citationId === "string")
        : [],
      issue: error instanceof Error ? error.message : "Recommendation validation failed.",
    });
    return undefined;
  }
}

export function validateCopilotAnswer(
  value: unknown,
  context: CopilotContextPacket,
  observe?: CopilotAnswerValidationObserver,
): CopilotAnswer {
  const answer = object(value);
  if (!answer) throw new CopilotAnswerValidationError("Answer must be a JSON object.");
  if (!Number.isSafeInteger(answer.snapshotRevision) || answer.snapshotRevision !== context.snapshotRevision)
    throw new CopilotAnswerValidationError("Answer snapshot revision does not match the active investigation snapshot.");

  const answerText = requiredText(answer.answer, "answer");
  if (!Array.isArray(answer.claims))
    throw new CopilotAnswerValidationError("claims must be an array.");
  if (!Array.isArray(answer.recommendations))
    throw new CopilotAnswerValidationError("recommendations must be an array.");

  const knownCitationIds = new Set(context.citations.map((citation) => citation.citationId));
  const claims = answer.claims.map((claim, index) => {
    try {
      const validatedClaim = validateClaim(claim, index, knownCitationIds);
      observe?.({
        assertionType: "claim",
        assertionIndex: index,
        accepted: true,
        citationIds: validatedClaim.citationIds,
      });
      return validatedClaim;
    } catch (error) {
      const claimValue = object(claim);
      observe?.({
        assertionType: "claim",
        assertionIndex: index,
        accepted: false,
        citationIds: Array.isArray(claimValue?.citationIds)
          ? claimValue.citationIds.filter((citationId): citationId is string => typeof citationId === "string")
          : [],
        issue: error instanceof Error ? error.message : "Claim validation failed.",
      });
      throw error;
    }
  });
  const recommendations = answer.recommendations.flatMap((recommendation, index) => {
    const validated = validateRecommendation(recommendation, index, knownCitationIds, observe);
    return validated ? [validated] : [];
  });
  const usedCitationIds = new Set([...claims.flatMap((claim) => claim.citationIds), ...recommendations.flatMap((recommendation) => recommendation.citationIds)]);

  return {
    answer: answerText,
    claims,
    recommendations,
    uncertainties: textArray(answer.uncertainties, "uncertainties"),
    followUpQuestions: textArray(answer.followUpQuestions, "followUpQuestions"),
    snapshotRevision: context.snapshotRevision,
    citations: context.citations.filter((citation) => usedCitationIds.has(citation.citationId)),
  };
}