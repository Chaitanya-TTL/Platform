import type {
  RetrievalChunkMetadata,
  RetrievalPrincipalScope,
} from "../../contracts";

export interface FixtureRetrievalChunk {
  readonly metadata: RetrievalChunkMetadata;
  readonly text: string;
  readonly semanticScore: number;
}

export const fixturePrincipal: RetrievalPrincipalScope = {
  tenantId: "tenant-a",
  principalId: "engineer-1",
  groupIds: ["engineering"],
  applicationEntitlements: ["windchill", "sap", "codebeamer", "configit"],
  policyVersion: "acl-v3",
  origin: "test-fixture",
};

export function fixtureChunk(
  input: Partial<RetrievalChunkMetadata> & Pick<RetrievalChunkMetadata, "chunkId" | "documentId" | "revision">,
  text: string,
  semanticScore = 0.5,
): FixtureRetrievalChunk {
  const sourceApplication = input.sourceApplication ?? "windchill";
  const accessScope = input.accessScope ?? {
    tenantId: "tenant-a",
    classification: "internal" as const,
    allowedPrincipalIds: ["engineer-1"],
    allowedGroupIds: [],
    policyVersion: "acl-v3",
  };
  return {
    metadata: {
      schemaVersion: "1.0",
      chunkId: input.chunkId,
      documentId: input.documentId,
      sectionPath: input.sectionPath ?? ["Requirements", "Steering"],
      chunkIndex: input.chunkIndex ?? 0,
      tokenCount: input.tokenCount ?? text.split(/\s+/).length,
      entityIds: input.entityIds ?? ["wc:part-1"],
      canonicalSubjectIds: input.canonicalSubjectIds ?? ["subject:steering"],
      sourceApplication,
      revision: input.revision,
      accessScope,
      lifecycleEligible: input.lifecycleEligible ?? true,
      revisionEligible: input.revisionEligible ?? true,
      contentHash: input.contentHash ?? `hash:${input.chunkId}`,
      sourceSystem: input.sourceSystem ?? sourceApplication,
      documentType: input.documentType ?? "specification",
      lifecycleState: input.lifecycleState ?? "released",
      sourceReference: input.sourceReference ?? {
        sourceSystem: sourceApplication,
        nativeDocumentId: `native:${input.documentId}`,
        uri: `https://private.example/${input.documentId}`,
      },
      extractedAt: input.extractedAt ?? "2026-11-01T00:00:00.000Z",
      documentContentHash: input.documentContentHash ?? `doc-hash:${input.documentId}`,
      metadata: input.metadata ?? {},
      ...(input.overlapGroupId ? { overlapGroupId: input.overlapGroupId } : {}),
    },
    text,
    semanticScore,
  };
}
