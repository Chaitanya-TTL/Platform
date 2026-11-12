import type {
  RetrievalCandidateMetadata,
  RetrievalRejection,
  RetrievalRejectionReason,
  RetrievalPrincipalScope,
} from "../contracts";
import type {
  RetrievalAccessPolicy,
  RetrievalAuthorizationResult,
} from "../ports/retrieval-access-policy";

function firstDenial(
  principal: RetrievalPrincipalScope | undefined,
  candidate: RetrievalCandidateMetadata,
): RetrievalRejectionReason | undefined {
  if (!principal) return "missing-principal";
  if (principal.origin !== "server-authenticated" && principal.origin !== "test-fixture") return "missing-principal";
  if (typeof principal.tenantId !== "string" || !principal.tenantId.trim()) return "missing-tenant";
  if (typeof principal.principalId !== "string" || !principal.principalId.trim()) return "missing-principal";
  if (typeof principal.policyVersion !== "string" || !principal.policyVersion.trim()) return "missing-policy-version";
  if (!Array.isArray(principal.groupIds) || !Array.isArray(principal.applicationEntitlements))
    return "missing-principal";
  if (!candidate.chunk.accessScope) return "missing-access-scope";

  const access = candidate.chunk.accessScope;
  if (typeof access.tenantId !== "string" || !access.tenantId.trim()) return "missing-tenant";
  if (typeof access.policyVersion !== "string" || !access.policyVersion.trim()) return "missing-policy-version";
  if (!["public", "internal", "restricted"].includes(access.classification) ||
      !Array.isArray(access.allowedPrincipalIds) ||
      !access.allowedPrincipalIds.every((item) => typeof item === "string" && Boolean(item.trim())) ||
      !Array.isArray(access.allowedGroupIds) ||
      !access.allowedGroupIds.every((item) => typeof item === "string" && Boolean(item.trim())))
    return "missing-access-metadata";
  if (access.tenantId !== principal.tenantId) return "tenant-mismatch";
  if (access.policyVersion !== principal.policyVersion) return "stale-policy-version";
  if (!principal.applicationEntitlements.some((application) =>
    application.toLocaleLowerCase("en-US") === candidate.chunk.sourceApplication.toLocaleLowerCase("en-US"),
  ))
    return "application-not-entitled";
  if (access.allowedPrincipalIds.includes(principal.principalId)) return undefined;
  if (access.allowedGroupIds.some((groupId) => principal.groupIds.includes(groupId))) return undefined;
  return "principal-not-allowed";
}

export const fixtureAccessPolicy: RetrievalAccessPolicy = {
  async authorizeCandidates(
    principal: RetrievalPrincipalScope | undefined,
    candidates: readonly RetrievalCandidateMetadata[],
  ): Promise<RetrievalAuthorizationResult> {
    const allowedChunkIds: string[] = [];
    const denied: RetrievalRejection[] = [];

    for (const candidate of candidates) {
      const reasonCode = firstDenial(principal, candidate);
      if (reasonCode) {
        denied.push({
          chunkId: candidate.chunk.chunkId,
          documentId: candidate.chunk.documentId,
          reasonCode,
        });
      } else {
        allowedChunkIds.push(candidate.chunk.chunkId);
      }
    }

    return { allowedChunkIds, denied };
  },
};
