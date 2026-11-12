import type { RetrievalIntent, RetrievalPrincipalScope, RetrievalQuery } from "./contracts";

export interface RetrievalQueryInput {
  readonly originalQuestion: string;
  readonly intent: RetrievalIntent;
  readonly investigationId: string;
  readonly canonicalSubjectIds: readonly string[];
  readonly selectedEntityIds: readonly string[];
  readonly relationshipEndpointEntityIds: readonly string[];
  readonly sourceApplicationFilters: readonly string[];
  readonly documentTypeFilters: readonly string[];
  readonly requestedTopK?: number;
}

export function normalizeRetrievalText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function unique(values: readonly string[], normalize = false): string[] {
  return [...new Set(values.map((value) => normalize ? value.trim().toLocaleLowerCase("en-US") : value.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function trustedPrincipal(principal: RetrievalPrincipalScope | undefined): principal is RetrievalPrincipalScope {
  if (!principal || (principal.origin !== "server-authenticated" && principal.origin !== "test-fixture"))
    return false;
  return typeof principal.principalId === "string" &&
    typeof principal.tenantId === "string" &&
    typeof principal.policyVersion === "string" &&
    Boolean(principal.principalId.trim() && principal.tenantId.trim() && principal.policyVersion.trim());
}

function boundedTopK(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 10;
  return Math.max(1, Math.min(10, Math.floor(value)));
}

export function buildRetrievalQuery(
  input: RetrievalQueryInput,
  serverPrincipal: RetrievalPrincipalScope | undefined,
): RetrievalQuery | undefined {
  if (input.intent !== "document" || !input.originalQuestion.trim() ||
      !input.investigationId.trim() || !trustedPrincipal(serverPrincipal)) return undefined;

  const normalizedQuestion = normalizeRetrievalText(input.originalQuestion);
  if (!normalizedQuestion) return undefined;

  return {
    schemaVersion: "1.0",
    originalQuestion: input.originalQuestion.trim(),
    normalizedQuestion,
    investigationId: input.investigationId.trim(),
    intent: "document",
    canonicalSubjectIds: unique(input.canonicalSubjectIds),
    selectedEntityIds: unique(input.selectedEntityIds),
    relationshipEndpointEntityIds: unique(input.relationshipEndpointEntityIds),
    sourceApplicationFilters: unique(input.sourceApplicationFilters, true),
    documentTypeFilters: unique(input.documentTypeFilters, true),
    accessScope: serverPrincipal,
    keywordQuery: normalizedQuestion,
    semanticQuery: input.originalQuestion.trim(),
    requestedTopK: boundedTopK(input.requestedTopK),
  };
}
