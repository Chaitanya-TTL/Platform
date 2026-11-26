import type {
  RetrievalCandidateMetadata,
  RetrievalPrincipalScope,
  RetrievalRejection,
} from "../contracts";

export interface RetrievalAuthorizationResult {
  readonly allowedChunkIds: readonly string[];
  readonly denied: readonly RetrievalRejection[];
}

export interface RetrievalAccessPolicy {
  authorizeCandidates(
    principal: RetrievalPrincipalScope | undefined,
    candidates: readonly RetrievalCandidateMetadata[],
  ): Promise<RetrievalAuthorizationResult>;
}
