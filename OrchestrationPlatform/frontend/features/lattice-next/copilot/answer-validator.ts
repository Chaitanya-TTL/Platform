import type { CopilotAnswer, CopilotClaim, CopilotContextPacket, CopilotRecommendation } from "./contracts";

export class CopilotAnswerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CopilotAnswerValidationError";
  }
}

const MAX_ANSWER_CHARS = 16_000;
const MAX_ITEMS = 100;
const MAX_ITEM_CHARS = 4_000;

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function requiredText(value: unknown, field: string, maximum = MAX_ITEM_CHARS): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum)
    throw new CopilotAnswerValidationError(`${field} must be a non-empty string within the allowed length.`);
  return value.trim();
}

function textArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_ITEMS)
    throw new CopilotAnswerValidationError(`${field} must be an array within the allowed item count.`);
  return value.map((item, index) => requiredText(item, `${field}[${index}]`, 2_000));
}

function citationIds(value: unknown, field: string, known: ReadonlySet<string>, required: boolean): string[] {
  if (!Array.isArray(value) || value.length > MAX_ITEMS || value.some((item) => typeof item !== "string" || item.length > 512))
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

function validateRecommendation(value: unknown, index: number, known: ReadonlySet<string>): CopilotRecommendation | undefined {
  try {
    const item = object(value);
    if (!item || item.approvalRequired !== true)
      throw new CopilotAnswerValidationError(`recommendations[${index}] must require engineer approval.`);
    return {
      text: requiredText(item.text, `recommendations[${index}].text`),
      rationale: requiredText(item.rationale, `recommendations[${index}].rationale`),
      citationIds: citationIds(item.citationIds, `recommendations[${index}].citationIds`, known, true),
      approvalRequired: true,
    };
  } catch {
    return undefined;
  }
}

export function validateCopilotAnswer(value: unknown, context: CopilotContextPacket): CopilotAnswer {
  const answer = object(value);
  if (!answer) throw new CopilotAnswerValidationError("Answer must be a JSON object.");
  if (!Number.isSafeInteger(answer.snapshotRevision) || answer.snapshotRevision !== context.snapshotRevision)
    throw new CopilotAnswerValidationError("Answer snapshot revision does not match the active investigation snapshot.");

  const answerText = requiredText(answer.answer, "answer", MAX_ANSWER_CHARS);
  if (!Array.isArray(answer.claims) || answer.claims.length > MAX_ITEMS)
    throw new CopilotAnswerValidationError("claims must be an array within the allowed item count.");
  if (!Array.isArray(answer.recommendations) || answer.recommendations.length > MAX_ITEMS)
    throw new CopilotAnswerValidationError("recommendations must be an array within the allowed item count.");

  const knownCitationIds = new Set(context.citations.map((citation) => citation.citationId));
  const claims = answer.claims.map((claim, index) => validateClaim(claim, index, knownCitationIds));
  const recommendations = answer.recommendations.flatMap((recommendation, index) => {
    const validated = validateRecommendation(recommendation, index, knownCitationIds);
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