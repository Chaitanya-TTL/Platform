import type { RetrievalEvidence } from "./contracts";

export interface RetrievalBudgetInput {
  readonly protectedCharacters: number;
  readonly primer?: string;
  readonly evidence: readonly RetrievalEvidence[];
  readonly hardLimit?: number;
  readonly reserveCharacters?: number;
  readonly primerMaximum?: number;
  readonly retrievalMaximum?: number;
}

export interface RetrievalBudgetResult {
  readonly protectedCharacters: number;
  readonly primer?: string;
  readonly evidence: readonly RetrievalEvidence[];
  readonly primerCharactersConsumed: number;
  readonly retrievalCharactersConsumed: number;
  readonly totalCharacters: number;
  readonly remainingReserve: number;
  readonly budgetExceeded: boolean;
  readonly omissionReasonCodes: readonly string[];
}

function boundedLimit(value: number | undefined, defaultValue: number, maximum: number): number {
  return value === undefined || !Number.isFinite(value)
    ? defaultValue
    : Math.max(0, Math.min(maximum, Math.floor(value)));
}

function encodedStringLength(value: string): number {
  return JSON.stringify(value).length;
}

function encodedEvidenceLength(evidence: readonly RetrievalEvidence[]): number {
  return evidence.length ? JSON.stringify(evidence).length : 0;
}

function primerWithinBudget(value: string, maximum: number, available: number): string | undefined {
  const characters = [...value];
  for (let count = Math.min(characters.length, maximum); count > 0; count -= 1) {
    const candidate = characters.slice(0, count).join("");
    if (candidate.length <= maximum && encodedStringLength(candidate) <= available) return candidate;
  }
  return undefined;
}

export function allocateRetrievalBudget(input: RetrievalBudgetInput): RetrievalBudgetResult {
  const hardLimit = boundedLimit(input.hardLimit, 24_000, 24_000);
  const reserveCharacters = boundedLimit(input.reserveCharacters, 1_500, hardLimit);
  const primerMaximum = boundedLimit(input.primerMaximum, 1_000, 1_000);
  const retrievalMaximum = boundedLimit(input.retrievalMaximum, 6_000, 6_000);
  const protectedCharacters = Math.max(0, Math.floor(input.protectedCharacters));
  const omissionReasonCodes: string[] = [];

  if (protectedCharacters > hardLimit) {
    return {
      protectedCharacters,
      evidence: [],
      primerCharactersConsumed: 0,
      retrievalCharactersConsumed: 0,
      totalCharacters: protectedCharacters,
      remainingReserve: 0,
      budgetExceeded: true,
      omissionReasonCodes: ["protected-context-over-limit"],
    };
  }

  let available = Math.max(0, hardLimit - protectedCharacters - reserveCharacters);
  const primer = input.primer?.trim()
    ? primerWithinBudget(input.primer.trim(), primerMaximum, available)
    : undefined;
  if (input.primer?.trim() && !primer) omissionReasonCodes.push("primer-budget-exceeded");
  if (primer && primer.length < input.primer!.trim().length) omissionReasonCodes.push("primer-truncated");
  const primerCharactersConsumed = primer ? encodedStringLength(primer) : 0;
  available = Math.max(0, available - primerCharactersConsumed);

  const rankedEvidence = [...input.evidence].sort((left, right) =>
    right.retrievalScore - left.retrievalScore ||
    left.chunkId.localeCompare(right.chunkId),
  );
  const retainedEvidence: RetrievalEvidence[] = [];
  for (const item of rankedEvidence) {
    const candidate = [...retainedEvidence, item];
    const serializedLength = encodedEvidenceLength(candidate);
    if (serializedLength <= retrievalMaximum && serializedLength <= available) {
      retainedEvidence.push(item);
    } else {
      omissionReasonCodes.push("retrieval-budget-exceeded");
    }
  }

  const retrievalCharactersConsumed = encodedEvidenceLength(retainedEvidence);
  const totalCharacters = protectedCharacters + primerCharactersConsumed + retrievalCharactersConsumed;
  const remainingReserve = Math.max(0, hardLimit - totalCharacters);
  return {
    protectedCharacters,
    ...(primer ? { primer } : {}),
    evidence: retainedEvidence,
    primerCharactersConsumed,
    retrievalCharactersConsumed,
    totalCharacters,
    remainingReserve,
    budgetExceeded: false,
    omissionReasonCodes: [...new Set(omissionReasonCodes)],
  };
}
