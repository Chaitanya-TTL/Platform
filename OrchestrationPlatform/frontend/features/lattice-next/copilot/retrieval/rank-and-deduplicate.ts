import type {
  RetrievalCandidate,
  RetrievalCandidateMetadata,
  RetrievalQuery,
  RetrievalScoreBreakdown,
} from "./contracts";

function normalizedScore(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;
}

function overlapScore(left: readonly string[], right: readonly string[]): number {
  return left.some((value) => right.includes(value)) ? 1 : 0;
}

function recencyScore(extractedAt: string, now: number): number {
  const timestamp = Date.parse(extractedAt);
  if (!Number.isFinite(timestamp)) return 0;
  const ageDays = Math.max(0, (now - timestamp) / 86_400_000);
  return Math.max(0, Math.min(1, 2 ** (-ageDays / 365)));
}

function compareCandidates(left: RetrievalCandidate, right: RetrievalCandidate): number {
  return right.finalScore - left.finalScore ||
    left.chunk.chunkId.localeCompare(right.chunk.chunkId);
}

function deduplicationKeys(candidate: RetrievalCandidate): string[] {
  const { chunk } = candidate;
  return [
    ...(chunk.contentHash ? [`content:${chunk.revision}:${chunk.contentHash}`] : []),
    ...(chunk.overlapGroupId
      ? [`overlap:${chunk.documentId}:${chunk.revision}:${chunk.sectionPath.join("/")}:${chunk.overlapGroupId}`]
      : []),
  ];
}

export function rankAndDeduplicate(
  query: RetrievalQuery,
  lexicalCandidates: readonly RetrievalCandidateMetadata[],
  semanticCandidates: readonly RetrievalCandidateMetadata[],
  now: string,
): { candidates: readonly RetrievalCandidate[]; duplicateChunkIds: readonly string[] } {
  const byChunkId = new Map<string, { chunk: RetrievalCandidateMetadata["chunk"]; lexicalScore: number; semanticScore: number }>();
  for (const candidate of lexicalCandidates) {
    const current = byChunkId.get(candidate.chunk.chunkId);
    byChunkId.set(candidate.chunk.chunkId, {
      chunk: current?.chunk ?? candidate.chunk,
      lexicalScore: Math.max(current?.lexicalScore ?? 0, normalizedScore(candidate.keywordScore)),
      semanticScore: current?.semanticScore ?? 0,
    });
  }
  for (const candidate of semanticCandidates) {
    const current = byChunkId.get(candidate.chunk.chunkId);
    byChunkId.set(candidate.chunk.chunkId, {
      chunk: current?.chunk ?? candidate.chunk,
      lexicalScore: current?.lexicalScore ?? 0,
      semanticScore: Math.max(current?.semanticScore ?? 0, normalizedScore(candidate.semanticScore)),
    });
  }

  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("Retrieval ranking requires a valid reference timestamp.");
  const ranked: RetrievalCandidate[] = [...byChunkId.values()].map(({ chunk, lexicalScore, semanticScore }) => {
    const subjectScore = overlapScore(chunk.canonicalSubjectIds, query.canonicalSubjectIds);
    const entityScore = overlapScore(chunk.entityIds, [
      ...query.selectedEntityIds,
      ...query.relationshipEndpointEntityIds,
    ]);
    const sourceApplicationScore = query.sourceApplicationFilters.includes(chunk.sourceApplication.toLocaleLowerCase("en-US")) ? 1 : 0;
    const candidateRecencyScore = recencyScore(chunk.extractedAt, nowMs);
    const scores: RetrievalScoreBreakdown = {
      semanticScore,
      keywordScore: lexicalScore,
      subjectScore,
      entityScore,
      sourceApplicationScore,
      recencyScore: candidateRecencyScore,
      finalScore:
        0.30 * semanticScore +
        0.30 * lexicalScore +
        0.15 * subjectScore +
        0.15 * entityScore +
        0.08 * sourceApplicationScore +
        0.02 * candidateRecencyScore,
    };
    const rankingReasons = [
      ...(semanticScore > 0 ? ["semantic-match"] : []),
      ...(lexicalScore > 0 ? ["lexical-match"] : []),
      ...(subjectScore > 0 ? ["canonical-subject-match"] : []),
      ...(entityScore > 0 ? ["investigation-entity-match"] : []),
      ...(sourceApplicationScore > 0 ? ["source-application-match"] : []),
    ];
    return { chunk, ...scores, rankingReasons };
  }).sort(compareCandidates);

  const seen = new Set<string>();
  const candidates: RetrievalCandidate[] = [];
  const duplicateChunkIds: string[] = [];
  for (const candidate of ranked) {
    const keys = deduplicationKeys(candidate);
    if (keys.some((key) => seen.has(key))) {
      duplicateChunkIds.push(candidate.chunk.chunkId);
      continue;
    }
    for (const key of keys) seen.add(key);
    candidates.push(candidate);
  }

  return { candidates, duplicateChunkIds: duplicateChunkIds.sort((left, right) => left.localeCompare(right)) };
}
