import type {
  RetrievalCandidateMetadata,
  RetrievalQuery,
} from "../contracts";

export interface RetrievalChunkText {
  readonly chunkId: string;
  readonly text: string;
}

export interface RetrievalIndex {
  lexicalCandidates(query: RetrievalQuery, limit: number): Promise<readonly RetrievalCandidateMetadata[]>;
  semanticCandidates(query: RetrievalQuery, limit: number): Promise<readonly RetrievalCandidateMetadata[]>;
  loadAuthorizedChunkText(authorizedChunkIds: readonly string[]): Promise<readonly RetrievalChunkText[]>;
}
