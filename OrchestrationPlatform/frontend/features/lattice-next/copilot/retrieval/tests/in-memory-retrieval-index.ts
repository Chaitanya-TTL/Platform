import { normalizeRetrievalText } from "../build-retrieval-query";
import type {
  RetrievalCandidateMetadata,
  RetrievalQuery,
} from "../contracts";
import type {
  RetrievalChunkText,
  RetrievalIndex,
} from "../ports/retrieval-index";
import type { FixtureRetrievalChunk } from "./fixtures/retrieval-fixtures";

export interface SemanticScorer {
  score(query: RetrievalQuery, chunkId: string): number;
}

export class FixtureSemanticScorer implements SemanticScorer {
  constructor(private readonly scores: Readonly<Record<string, number>> = {}) {}

  score(_query: RetrievalQuery, chunkId: string): number {
    return this.scores[chunkId] ?? 0;
  }
}

function tokens(value: string): string[] {
  return normalizeRetrievalText(value).split(" ").filter(Boolean);
}

function bm25(
  queryTerms: readonly string[],
  documentTerms: readonly string[],
  documentFrequency: ReadonlyMap<string, number>,
  documentCount: number,
  averageLength: number,
): number {
  const termFrequency = new Map<string, number>();
  for (const term of documentTerms) termFrequency.set(term, (termFrequency.get(term) ?? 0) + 1);
  const k1 = 1.2;
  const b = 0.75;
  return queryTerms.reduce((score, term) => {
    const frequency = termFrequency.get(term) ?? 0;
    if (!frequency) return score;
    const df = documentFrequency.get(term) ?? 0;
    const idf = Math.log(1 + (documentCount - df + 0.5) / (df + 0.5));
    const denominator = frequency + k1 * (1 - b + b * documentTerms.length / Math.max(1, averageLength));
    return score + idf * (frequency * (k1 + 1)) / denominator;
  }, 0);
}

function candidate(
  chunk: FixtureRetrievalChunk,
  score: { semanticScore?: number; keywordScore?: number },
): RetrievalCandidateMetadata {
  return {
    chunk: chunk.metadata,
    ...score,
    rankingReasons: [],
  };
}

export class InMemoryRetrievalIndex implements RetrievalIndex {
  private readonly chunksById: ReadonlyMap<string, FixtureRetrievalChunk>;

  constructor(
    chunks: readonly FixtureRetrievalChunk[],
    private readonly semanticScorer: SemanticScorer = new FixtureSemanticScorer(
      Object.fromEntries(chunks.map((chunk) => [chunk.metadata.chunkId, chunk.semanticScore])),
    ),
  ) {
    if (new Set(chunks.map((chunk) => chunk.metadata.chunkId)).size !== chunks.length)
      throw new Error("Fixture retrieval chunks must have unique IDs.");
    this.chunksById = new Map(chunks.map((chunk) => [chunk.metadata.chunkId, chunk]));
  }

  async lexicalCandidates(query: RetrievalQuery, limit: number): Promise<readonly RetrievalCandidateMetadata[]> {
    const chunks = [...this.chunksById.values()];
    const queryTerms = tokens(query.keywordQuery);
    const tokenized = chunks.map((chunk) => tokens(chunk.text));
    const documentFrequency = new Map<string, number>();
    for (const terms of tokenized) {
      for (const term of new Set(terms)) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
    const averageLength = tokenized.reduce((sum, terms) => sum + terms.length, 0) / Math.max(1, tokenized.length);
    const scored = chunks.map((chunk, index) => ({
      chunk,
      score: bm25(queryTerms, tokenized[index], documentFrequency, chunks.length, averageLength),
    })).filter((item) => item.score > 0);
    const maximum = Math.max(0, ...scored.map((item) => item.score));
    return scored
      .map(({ chunk, score }) => candidate(chunk, { keywordScore: maximum ? score / maximum : 0 }))
      .sort((left, right) =>
        (right.keywordScore ?? 0) - (left.keywordScore ?? 0) ||
        left.chunk.chunkId.localeCompare(right.chunk.chunkId),
      )
      .slice(0, Math.max(0, Math.floor(limit)));
  }

  async semanticCandidates(query: RetrievalQuery, limit: number): Promise<readonly RetrievalCandidateMetadata[]> {
    return [...this.chunksById.values()]
      .map((chunk) => candidate(chunk, { semanticScore: this.semanticScorer.score(query, chunk.metadata.chunkId) }))
      .filter((item) => (item.semanticScore ?? 0) > 0)
      .sort((left, right) =>
        (right.semanticScore ?? 0) - (left.semanticScore ?? 0) ||
        left.chunk.chunkId.localeCompare(right.chunk.chunkId),
      )
      .slice(0, Math.max(0, Math.floor(limit)));
  }

  async loadAuthorizedChunkText(authorizedChunkIds: readonly string[]): Promise<readonly RetrievalChunkText[]> {
    return authorizedChunkIds.flatMap((chunkId) => {
      const chunk = this.chunksById.get(chunkId);
      return chunk ? [{ chunkId, text: chunk.text }] : [];
    });
  }
}
