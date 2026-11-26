import { describe, expect, it } from "vitest";
import type {
  RetrievalCandidateMetadata,
  RetrievalPrincipalScope,
} from "../contracts";
import { buildRetrievalQuery, normalizeRetrievalText } from "../build-retrieval-query";
import { fixtureAccessPolicy } from "./fixture-access-policy";

const principal: RetrievalPrincipalScope = {
  tenantId: "tenant-a",
  principalId: "engineer-1",
  groupIds: ["engineering"],
  applicationEntitlements: ["windchill"],
  policyVersion: "acl-v3",
  origin: "test-fixture",
};

const queryInput = {
  originalQuestion: "  How does the steering requirement work?  ",
  intent: "document" as const,
  investigationId: "investigation-1",
  canonicalSubjectIds: ["subject:steering"],
  selectedEntityIds: ["wc:part-1"],
  relationshipEndpointEntityIds: ["sap:material-1"],
  sourceApplicationFilters: ["Windchill"],
  documentTypeFilters: ["Specification"],
};

function candidate(overrides: {
  accessScope?: RetrievalCandidateMetadata["chunk"]["accessScope"] | null;
  tenantId?: string;
  policyVersion?: string;
  allowedPrincipalIds?: readonly string[];
  allowedGroupIds?: readonly string[];
  sourceApplication?: string;
} = {}): RetrievalCandidateMetadata {
  return {
    chunk: {
      schemaVersion: "1.0",
      chunkId: "chunk-1",
      documentId: "doc-1",
      sectionPath: ["Requirements", "Steering"],
      chunkIndex: 0,
      tokenCount: 20,
      entityIds: ["wc:part-1"],
      canonicalSubjectIds: ["subject:steering"],
      sourceApplication: overrides.sourceApplication ?? "windchill",
      revision: "A",
      sourceSystem: "Windchill",
      documentType: "specification",
      lifecycleState: "released",
      sourceReference: { sourceSystem: "Windchill", nativeDocumentId: "DOC-1" },
      extractedAt: "2026-11-01T00:00:00.000Z",
      documentContentHash: "doc-hash-1",
      metadata: {},
      contentHash: "chunk-hash-1",
      ...(!Object.prototype.hasOwnProperty.call(overrides, "accessScope")
        ? {
            accessScope: {
              tenantId: overrides.tenantId ?? "tenant-a",
              classification: "internal",
              allowedPrincipalIds: overrides.allowedPrincipalIds ?? ["engineer-1"],
              allowedGroupIds: overrides.allowedGroupIds ?? [],
              policyVersion: overrides.policyVersion ?? "acl-v3",
            },
          }
        : overrides.accessScope ? { accessScope: overrides.accessScope } : {}),
    },
    semanticScore: 0.6,
    keywordScore: 0.8,
    rankingReasons: [],
  };
}

describe("retrieval query construction", () => {
  it("builds a normalized document query with bounded top-k and graph-only ranking signals", () => {
    const query = buildRetrievalQuery({ ...queryInput, requestedTopK: 25 }, principal);

    expect(query).toMatchObject({
      intent: "document",
      investigationId: "investigation-1",
      normalizedQuestion: "how does the steering requirement work",
      keywordQuery: "how does the steering requirement work",
      semanticQuery: queryInput.originalQuestion.trim(),
      requestedTopK: 10,
      canonicalSubjectIds: ["subject:steering"],
      selectedEntityIds: ["wc:part-1"],
      relationshipEndpointEntityIds: ["sap:material-1"],
      accessScope: principal,
    });
    expect(query).not.toHaveProperty("relationships");
    expect(normalizeRetrievalText("  Straße—A  ")).toBe("straße a");
  });

  it("does not construct queries for frozen or other non-document intents", () => {
    expect(buildRetrievalQuery({ ...queryInput, intent: "summary" }, principal)).toBeUndefined();
    expect(buildRetrievalQuery({ ...queryInput, intent: "impact" }, principal)).toBeUndefined();
    expect(buildRetrievalQuery({ ...queryInput, intent: "relationship" }, principal)).toBeUndefined();
    expect(buildRetrievalQuery({ ...queryInput, intent: "evidence" }, principal)).toBeUndefined();
  });

  it("fails closed when the server-derived principal is missing or incomplete", () => {
    expect(buildRetrievalQuery(queryInput, undefined)).toBeUndefined();
    expect(buildRetrievalQuery(queryInput, { ...principal, tenantId: "" })).toBeUndefined();
    expect(buildRetrievalQuery(queryInput, { ...principal, principalId: "" })).toBeUndefined();
    expect(buildRetrievalQuery(queryInput, { ...principal, policyVersion: "" })).toBeUndefined();
  });

  it("does not trust principal fields embedded in caller input", () => {
    const clientInput = {
      ...queryInput,
      accessScope: { ...principal, tenantId: "attacker-tenant", principalId: "attacker" },
    };
    const query = buildRetrievalQuery(clientInput, principal);

    expect(query?.accessScope).toEqual(principal);
    expect(query?.accessScope.tenantId).not.toBe("attacker-tenant");
  });

  it("bounds requested top-k to the supported range", () => {
    expect(buildRetrievalQuery({ ...queryInput, requestedTopK: -4 }, principal)?.requestedTopK).toBe(1);
    expect(buildRetrievalQuery({ ...queryInput, requestedTopK: 5.8 }, principal)?.requestedTopK).toBe(5);
    expect(buildRetrievalQuery({ ...queryInput, requestedTopK: Number.NaN }, principal)?.requestedTopK).toBe(10);
  });
});

describe("fixture retrieval access policy", () => {
  it("allows a document with matching tenant, policy, entitlement, and principal ACL", async () => {
    const result = await fixtureAccessPolicy.authorizeCandidates(principal, [candidate()]);

    expect(result.allowedChunkIds).toEqual(["chunk-1"]);
    expect(result.denied).toEqual([]);
  });

  it("denies a tenant mismatch", async () => {
    const result = await fixtureAccessPolicy.authorizeCandidates(principal, [candidate({ tenantId: "tenant-b" })]);

    expect(result.allowedChunkIds).toEqual([]);
    expect(result.denied).toContainEqual({ chunkId: "chunk-1", documentId: "doc-1", reasonCode: "tenant-mismatch" });
  });

  it("denies a missing tenant on indexed ACL metadata", async () => {
    const result = await fixtureAccessPolicy.authorizeCandidates(principal, [candidate({ tenantId: "" })]);

    expect(result.allowedChunkIds).toEqual([]);
    expect(result.denied[0]?.reasonCode).toBe("missing-tenant");
  });

  it("denies a missing principal", async () => {
    const result = await fixtureAccessPolicy.authorizeCandidates(undefined, [candidate()]);

    expect(result.allowedChunkIds).toEqual([]);
    expect(result.denied).toContainEqual({ chunkId: "chunk-1", documentId: "doc-1", reasonCode: "missing-principal" });
  });

  it("denies missing ACL metadata", async () => {
    const result = await fixtureAccessPolicy.authorizeCandidates(principal, [candidate({ accessScope: null })]);

    expect(result.allowedChunkIds).toEqual([]);
    expect(result.denied).toContainEqual({ chunkId: "chunk-1", documentId: "doc-1", reasonCode: "missing-access-scope" });
  });

  it("denies stale or missing policy versions", async () => {
    const stale = await fixtureAccessPolicy.authorizeCandidates(principal, [candidate({ policyVersion: "acl-v2" })]);
    const missing = await fixtureAccessPolicy.authorizeCandidates(principal, [candidate({
      accessScope: {
        tenantId: "tenant-a",
        classification: "internal",
        allowedPrincipalIds: ["engineer-1"],
        allowedGroupIds: [],
        policyVersion: "",
      },
    })]);

    expect(stale.denied[0]?.reasonCode).toBe("stale-policy-version");
    expect(missing.denied[0]?.reasonCode).toBe("missing-policy-version");
  });

  it("denies documents not granted to the principal or their groups", async () => {
    const result = await fixtureAccessPolicy.authorizeCandidates(principal, [
      candidate({ allowedPrincipalIds: ["someone-else"], allowedGroupIds: ["quality"] }),
    ]);

    expect(result.allowedChunkIds).toEqual([]);
    expect(result.denied[0]?.reasonCode).toBe("principal-not-allowed");
  });
});
