import { describe, expect, it, vi } from "vitest";
import { buildRetrievalQuery } from "../build-retrieval-query";
import type { RetrievalCandidateMetadata } from "../contracts";
import { retrieveEvidence } from "../retrieve-evidence";
import { InMemoryRetrievalIndex } from "./in-memory-retrieval-index";
import { fixtureAccessPolicy } from "./fixture-access-policy";
import { fixtureChunk, fixturePrincipal } from "./fixtures/retrieval-fixtures";

const query = buildRetrievalQuery({
  originalQuestion: "What does the steering specification require?",
  intent: "document",
  investigationId: "investigation-rag",
  canonicalSubjectIds: ["subject:steering"],
  selectedEntityIds: ["wc:part-1"],
  relationshipEndpointEntityIds: ["sap:material-1"],
  sourceApplicationFilters: [],
  documentTypeFilters: [],
}, fixturePrincipal)!;

const diagnosticStore = { persist: vi.fn(async () => undefined) };

function candidateWithoutText(overrides: {
  chunkId: string;
  accessScope?: RetrievalCandidateMetadata["chunk"]["accessScope"];
  allowedPrincipalIds?: readonly string[];
  contentHash?: string;
  overlapGroupId?: string;
  semanticScore?: number;
  lifecycleEligible?: boolean;
  revisionEligible?: boolean;
  sourceApplication?: string;
  documentType?: string;
}): ReturnType<typeof fixtureChunk> {
  return fixtureChunk({
    chunkId: overrides.chunkId,
    documentId: "doc-shared",
    revision: "A",
    ...(overrides.accessScope ? { accessScope: overrides.accessScope } : {}),
    ...(overrides.allowedPrincipalIds ? {
      accessScope: {
        tenantId: "tenant-a",
        classification: "internal",
        allowedPrincipalIds: overrides.allowedPrincipalIds,
        allowedGroupIds: [],
        policyVersion: "acl-v3",
      },
    } : {}),
    ...(overrides.contentHash ? { contentHash: overrides.contentHash } : {}),
    ...(overrides.overlapGroupId ? { overlapGroupId: overrides.overlapGroupId } : {}),
    ...(overrides.lifecycleEligible !== undefined ? { lifecycleEligible: overrides.lifecycleEligible } : {}),
    ...(overrides.revisionEligible !== undefined ? { revisionEligible: overrides.revisionEligible } : {}),
    ...(overrides.sourceApplication ? { sourceApplication: overrides.sourceApplication } : {}),
    ...(overrides.documentType ? { documentType: overrides.documentType } : {}),
  }, `steering specification text ${overrides.chunkId}`, overrides.semanticScore);
}

describe("fixture-backed retrieval evidence", () => {
  it("authorizes metadata before loading text and never leaks denied text to evidence or diagnostics", async () => {
    const deniedText = "CONFIDENTIAL DENIED BEST MATCH steering specification";
    const chunks = [
      fixtureChunk({
        chunkId: "denied-best",
        documentId: "private-doc",
        revision: "A",
        accessScope: {
          tenantId: "tenant-a",
          classification: "restricted",
          allowedPrincipalIds: ["another-user"],
          allowedGroupIds: [],
          policyVersion: "acl-v3",
        },
      }, deniedText, 0.99),
      fixtureChunk({
        chunkId: "allowed-hit",
        documentId: "allowed-doc",
        revision: "A",
      }, "The steering specification requires a verified torque range.", 0.8),
    ];
    const index = new InMemoryRetrievalIndex(chunks);
    const metadataCandidates = await index.lexicalCandidates(query, 10);
    const loadSpy = vi.spyOn(index, "loadAuthorizedChunkText");
    const store = { persist: vi.fn(async () => undefined) };

    expect(metadataCandidates.length).toBeGreaterThan(0);
    expect(metadataCandidates[0]?.chunk).not.toHaveProperty("text");
    const result = await retrieveEvidence({
      query,
      index,
      accessPolicy: fixtureAccessPolicy,
      diagnosticsStore: store,
      requestId: "request-1",
      snapshotRevision: 7,
      now: "2026-11-11T00:00:00.000Z",
    });

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(loadSpy).toHaveBeenCalledWith(["allowed-hit"]);
    expect(result.evidence.map((item) => item.chunkId)).toEqual(["allowed-hit"]);
    expect(store.persist).toHaveBeenCalledWith(result.diagnostics);
    expect(JSON.stringify(result.evidence)).not.toContain("CONFIDENTIAL");
    expect(JSON.stringify(result.diagnostics)).not.toContain(deniedText);
    expect(JSON.stringify(result.diagnostics)).not.toContain("verified torque range");
    expect(JSON.stringify(result.diagnostics)).not.toContain("private.example");
    expect(JSON.stringify(result.diagnostics)).not.toContain("another-user");
    expect(result.diagnostics.rejectedCandidates).toContainEqual({
      chunkId: "denied-best",
      documentId: "private-doc",
      reasonCode: "principal-not-allowed",
    });
  });

  it("combines hybrid scores and records duplicate content and overlap removals", async () => {
    const chunks = [
      candidateWithoutText({ chunkId: "dedup-lower", contentHash: "same-hash", semanticScore: 0.2 }),
      candidateWithoutText({ chunkId: "dedup-winner", contentHash: "same-hash", semanticScore: 0.95 }),
      candidateWithoutText({ chunkId: "overlap-lower", overlapGroupId: "paragraph-1", semanticScore: 0.1 }),
      candidateWithoutText({ chunkId: "overlap-winner", overlapGroupId: "paragraph-1", semanticScore: 0.9 }),
    ];
    const result = await retrieveEvidence({
      query,
      index: new InMemoryRetrievalIndex(chunks),
      accessPolicy: fixtureAccessPolicy,
      diagnosticsStore: diagnosticStore,
      requestId: "request-dedup",
      snapshotRevision: 7,
      now: "2026-11-11T00:00:00.000Z",
    });

    expect(result.evidence.map((item) => item.chunkId)).toEqual(["dedup-winner", "overlap-winner"]);
    expect(result.diagnostics.duplicateChunkIds).toEqual(["dedup-lower", "overlap-lower"]);
    expect(result.diagnostics.scoreBreakdowns.every(({ scores }) =>
      [scores.semanticScore, scores.keywordScore, scores.subjectScore, scores.entityScore,
        scores.sourceApplicationScore, scores.recencyScore, scores.finalScore]
        .every((score) => score >= 0 && score <= 1),
    )).toBe(true);
    expect(result.diagnostics.scoreBreakdowns[0]?.scores.finalScore).toBeCloseTo(
      0.30 * result.diagnostics.scoreBreakdowns[0]!.scores.semanticScore +
      0.30 * result.diagnostics.scoreBreakdowns[0]!.scores.keywordScore +
      0.15 * result.diagnostics.scoreBreakdowns[0]!.scores.subjectScore +
      0.15 * result.diagnostics.scoreBreakdowns[0]!.scores.entityScore +
      0.08 * result.diagnostics.scoreBreakdowns[0]!.scores.sourceApplicationScore +
      0.02 * result.diagnostics.scoreBreakdowns[0]!.scores.recencyScore,
    );
  });

  it("applies source, document type, lifecycle, and revision hard filters before authorization", async () => {
    const index = new InMemoryRetrievalIndex([
      candidateWithoutText({ chunkId: "wrong-source", sourceApplication: "sap" }),
      candidateWithoutText({ chunkId: "wrong-type", documentType: "manual" }),
      candidateWithoutText({ chunkId: "withdrawn", lifecycleEligible: false }),
      candidateWithoutText({ chunkId: "old-revision", revisionEligible: false }),
      candidateWithoutText({ chunkId: "eligible" }),
    ]);
    const accessSpy = vi.spyOn(fixtureAccessPolicy, "authorizeCandidates");
    const result = await retrieveEvidence({
      query: {
        ...query,
        sourceApplicationFilters: ["windchill"],
        documentTypeFilters: ["specification"],
      },
      index,
      accessPolicy: fixtureAccessPolicy,
      diagnosticsStore: diagnosticStore,
      requestId: "request-filter",
      snapshotRevision: 7,
      now: "2026-11-11T00:00:00.000Z",
    });

    expect(result.evidence.map((item) => item.chunkId)).toEqual(["eligible"]);
    const authorizedIds = accessSpy.mock.calls.at(-1)?.[1].map((item) => item.chunk.chunkId);
    expect(authorizedIds).toEqual(["eligible"]);
    expect(result.diagnostics.rejectedCandidates.map((item) => item.reasonCode)).toEqual(expect.arrayContaining([
      "source-application-filter",
      "document-type-filter",
      "lifecycle-ineligible",
      "revision-ineligible",
    ]));
  });

  it("fails closed and skips text loading when authorization errors", async () => {
    const index = new InMemoryRetrievalIndex([candidateWithoutText({ chunkId: "must-not-load" })]);
    const loadSpy = vi.spyOn(index, "loadAuthorizedChunkText");
    const store = { persist: vi.fn(async () => undefined) };

    const result = await retrieveEvidence({
      query,
      index,
      accessPolicy: {
        authorizeCandidates: async () => { throw new Error("policy unavailable"); },
      },
      diagnosticsStore: store,
      requestId: "request-policy-error",
      snapshotRevision: 7,
      now: "2026-11-11T00:00:00.000Z",
    });

    expect(loadSpy).not.toHaveBeenCalled();
    expect(result.status).toBe("authorization-failed");
    expect(result.evidence).toEqual([]);
    expect(result.diagnostics.rejectedCandidates).toContainEqual(expect.objectContaining({
      chunkId: "must-not-load",
      reasonCode: "authorization-error",
    }));
  });
});
