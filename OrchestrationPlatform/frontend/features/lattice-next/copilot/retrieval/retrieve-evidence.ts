import type {
  RetrievalCandidate,
  RetrievalCandidateMetadata,
  RetrievalDiagnostics,
  RetrievalEvidence,
  RetrievalQuery,
  RetrievalRejection,
  RetrievalSearchResult,
} from "./contracts";
import { retrievalCitationId } from "./retrieval-citation";
import { rankAndDeduplicate } from "./rank-and-deduplicate";
import type { RetrievalAccessPolicy } from "./ports/retrieval-access-policy";
import type { RetrievalDiagnosticsStore } from "./ports/retrieval-diagnostics-store";
import type { RetrievalIndex } from "./ports/retrieval-index";

export interface RetrieveEvidenceInput {
  readonly query: RetrievalQuery;
  readonly index: RetrievalIndex;
  readonly accessPolicy: RetrievalAccessPolicy;
  readonly diagnosticsStore: RetrievalDiagnosticsStore;
  readonly requestId: string;
  readonly snapshotRevision: number;
  readonly now?: string;
  readonly clock?: () => number;
}

function metadataCandidate(candidate: RetrievalCandidate): RetrievalCandidateMetadata {
  return {
    chunk: candidate.chunk,
    semanticScore: candidate.semanticScore,
    keywordScore: candidate.keywordScore,
    rankingReasons: candidate.rankingReasons,
  };
}

function hardFilterReason(candidate: RetrievalCandidate, query: RetrievalQuery): RetrievalRejection["reasonCode"] | undefined {
  const chunk = candidate.chunk;
  if (!chunk.lifecycleEligible || !["released", "approved", "effective"].includes(chunk.lifecycleState.toLocaleLowerCase("en-US")))
    return "lifecycle-ineligible";
  if (!chunk.revisionEligible) return "revision-ineligible";
  if (query.sourceApplicationFilters.length &&
      !query.sourceApplicationFilters.includes(chunk.sourceApplication.toLocaleLowerCase("en-US")))
    return "source-application-filter";
  if (query.documentTypeFilters.length &&
      !query.documentTypeFilters.includes(chunk.documentType.toLocaleLowerCase("en-US")))
    return "document-type-filter";
  return undefined;
}

function diagnosticQuery(query: RetrievalQuery): RetrievalDiagnostics["query"] {
  return {
    originalQuestion: query.originalQuestion,
    normalizedQuestion: query.normalizedQuestion,
    intent: query.intent,
    keywordQuery: query.keywordQuery,
    semanticQuery: query.semanticQuery,
  };
}

function evidenceFor(candidate: RetrievalCandidate, text: string, policyVersion: string, decidedAt: string): RetrievalEvidence {
  const chunk = candidate.chunk;
  return {
    schemaVersion: "1.0",
    evidenceId: `retrieval-evidence:v1:${[
      chunk.documentId,
      chunk.revision,
      chunk.chunkId,
    ].map(encodeURIComponent).join(":")}`,
    citationId: retrievalCitationId(chunk.documentId, chunk.revision, chunk.chunkId),
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    sourceApplication: chunk.sourceApplication,
    excerpt: text,
    sectionPath: chunk.sectionPath,
    revision: chunk.revision,
    sourceReference: chunk.sourceReference,
    retrievalScore: candidate.finalScore,
    accessDecision: {
      decision: "allowed",
      policyVersion,
      decidedAt,
    },
    provenance: {
      authority: "retrieved-document",
      sourceSystem: chunk.sourceSystem,
      extractedAt: chunk.extractedAt,
      contentHash: chunk.contentHash,
    },
  };
}

function scoreBreakdowns(candidates: readonly RetrievalCandidate[]): RetrievalDiagnostics["scoreBreakdowns"] {
  return candidates.map((candidate) => ({
    chunkId: candidate.chunk.chunkId,
    scores: {
      semanticScore: candidate.semanticScore,
      keywordScore: candidate.keywordScore,
      subjectScore: candidate.subjectScore,
      entityScore: candidate.entityScore,
      sourceApplicationScore: candidate.sourceApplicationScore,
      recencyScore: candidate.recencyScore,
      finalScore: candidate.finalScore,
    },
  }));
}

export async function retrieveEvidence(input: RetrieveEvidenceInput): Promise<RetrievalSearchResult> {
  const clock = input.clock ?? Date.now;
  const startedAt = clock();
  const now = input.now ?? new Date().toISOString();
  const limit = input.query.requestedTopK;
  const [lexical, semantic] = await Promise.all([
    input.index.lexicalCandidates(input.query, limit),
    input.index.semanticCandidates(input.query, limit),
  ]);
  const { candidates: ranked, duplicateChunkIds } = rankAndDeduplicate(input.query, lexical, semantic, now);
  const rejected: RetrievalRejection[] = [];
  const hardFiltered: RetrievalCandidate[] = [];
  for (const candidate of ranked) {
    const reasonCode = hardFilterReason(candidate, input.query);
    if (reasonCode) rejected.push({
      chunkId: candidate.chunk.chunkId,
      documentId: candidate.chunk.documentId,
      reasonCode,
    });
    else hardFiltered.push(candidate);
  }

  let authorizationFailed = false;
  let allowedChunkIds: readonly string[] = [];
  try {
    const authorization = await input.accessPolicy.authorizeCandidates(
      input.query.accessScope,
      hardFiltered.map(metadataCandidate),
    );
    const candidateIds = new Set(hardFiltered.map((candidate) => candidate.chunk.chunkId));
    const returnedAllowedIds = new Set(authorization.allowedChunkIds);
    const unexpectedAllowedId = [...returnedAllowedIds].some((chunkId) => !candidateIds.has(chunkId));
    const deniedIds = new Set(authorization.denied.map((item) => item.chunkId));
    const unexpectedDeniedId = [...deniedIds].some((chunkId) => !candidateIds.has(chunkId));
    const conflictingDecision = [...returnedAllowedIds].some((chunkId) => deniedIds.has(chunkId));
    if (unexpectedAllowedId || unexpectedDeniedId || conflictingDecision)
      throw new Error("Retrieval access policy returned an inconsistent authorization result.");
    allowedChunkIds = [...returnedAllowedIds];
    const validDenials = authorization.denied.filter((item) => candidateIds.has(item.chunkId));
    rejected.push(...validDenials);
    authorizationFailed = validDenials.some((item) => item.reasonCode === "authorization-error");
    const decisionIds = new Set([...returnedAllowedIds, ...deniedIds]);
    for (const candidate of hardFiltered) {
      if (!decisionIds.has(candidate.chunk.chunkId)) {
        authorizationFailed = true;
        rejected.push({
          chunkId: candidate.chunk.chunkId,
          documentId: candidate.chunk.documentId,
          reasonCode: "authorization-error",
        });
      }
    }
  } catch {
    authorizationFailed = true;
    allowedChunkIds = [];
    rejected.push(...hardFiltered.map((candidate) => ({
      chunkId: candidate.chunk.chunkId,
      documentId: candidate.chunk.documentId,
      reasonCode: "authorization-error" as const,
    })));
  }

  const allowedSet = new Set(allowedChunkIds);
  const selected = hardFiltered
    .filter((candidate) => allowedSet.has(candidate.chunk.chunkId))
    .slice(0, limit);
  let evidence: RetrievalEvidence[] = [];
  if (selected.length) {
    const selectedIds = selected.map((candidate) => candidate.chunk.chunkId);
    const loadedText = await input.index.loadAuthorizedChunkText(selectedIds);
    const textById = new Map(loadedText.map((item) => [item.chunkId, item.text]));
    const unexpectedText = loadedText.some((item) => !selectedIds.includes(item.chunkId));
    const missingText = selectedIds.filter((chunkId) => !textById.has(chunkId));
    if (unexpectedText || missingText.length)
      throw new Error("Retrieval index returned text outside the authorized chunk selection.");
    evidence = selected.flatMap((candidate) => {
      const text = textById.get(candidate.chunk.chunkId)!;
      return text.trim()
        ? [evidenceFor(candidate, text, input.query.accessScope.policyVersion, now)]
        : [];
    });
    for (const candidate of selected) {
      if (!textById.get(candidate.chunk.chunkId)?.trim())
        rejected.push({
          chunkId: candidate.chunk.chunkId,
          documentId: candidate.chunk.documentId,
          reasonCode: "empty-chunk-text",
        });
    }
  }

  const diagnostics: RetrievalDiagnostics = {
    schemaVersion: "1.0",
    requestId: input.requestId,
    investigationId: input.query.investigationId,
    snapshotRevision: input.snapshotRevision,
    query: diagnosticQuery(input.query),
    candidateCount: new Set([...lexical, ...semantic].map((candidate) => candidate.chunk.chunkId)).size,
    filteredCount: rejected.length,
    selectedCount: evidence.length,
    rejectedCandidates: rejected,
    scoreBreakdowns: scoreBreakdowns(ranked),
    selectedChunkIds: evidence.map((item) => item.chunkId),
    duplicateChunkIds,
    omissionReasonCodes: [
      ...(duplicateChunkIds.length ? ["duplicate-chunks-removed"] : []),
      ...(rejected.some((item) => item.reasonCode === "authorization-error") ? ["authorization-failed"] : []),
      ...(rejected.some((item) => item.reasonCode !== "authorization-error") ? ["candidates-filtered"] : []),
      ...(selected.length > evidence.length ? ["empty-chunk-text"] : []),
    ],
    retrievalDurationMs: Math.max(0, Math.round(clock() - startedAt)),
    contextCharactersConsumed: evidence.reduce((sum, item) => sum + item.excerpt.length, 0),
  };
  await input.diagnosticsStore.persist(diagnostics);
  return {
    schemaVersion: "1.0",
    status: authorizationFailed ? "authorization-failed" : "complete",
    evidence,
    diagnostics,
  };
}
