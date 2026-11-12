import { describe, expect, it } from "vitest";
import { allocateRetrievalBudget } from "../allocate-retrieval-budget";
import { buildRetrievalQuery } from "../build-retrieval-query";
import type { RetrievalEvidence, RetrievalIntent } from "../contracts";
import { retrievalCitationId } from "../retrieval-citation";
import { retrieveEvidence } from "../retrieve-evidence";
import { scoreRetrievalEvaluation } from "./evaluation-metrics";
import { fixtureAccessPolicy } from "./fixture-access-policy";
import { FixtureSemanticScorer, InMemoryRetrievalIndex } from "./in-memory-retrieval-index";
import { fixtureChunk, fixturePrincipal, type FixtureRetrievalChunk } from "./fixtures/retrieval-fixtures";

interface EvaluationCase {
  readonly id: string;
  readonly question: string;
  readonly intent: RetrievalIntent;
  readonly chunks: readonly FixtureRetrievalChunk[];
  readonly expectedRelevantChunkIds: readonly string[];
  readonly expectedSubjectIds: readonly string[];
  readonly expectedApplications: readonly string[];
  readonly forbiddenChunkIds?: readonly string[];
  readonly forbiddenText?: readonly string[];
  readonly graphRelationships: readonly { readonly id: string; readonly authority: "graph" }[];
  readonly expectGraphUnchanged?: boolean;
}

const cases: readonly EvaluationCase[] = [
  {
    id: "graph-only",
    question: "Which authoritative relationship connects the Windchill part and SAP material?",
    intent: "relationship",
    chunks: [fixtureChunk({ chunkId: "unused-graph-doc", documentId: "graph-doc", revision: "A" }, "steering relationship explanation", 0.8)],
    expectedRelevantChunkIds: [],
    expectedSubjectIds: [],
    expectedApplications: [],
    graphRelationships: [{ id: "rel:windchill-sap", authority: "graph" }],
    expectGraphUnchanged: true,
  },
  {
    id: "document-only",
    question: "What torque range does the steering specification require?",
    intent: "document",
    chunks: [fixtureChunk({ chunkId: "document-answer", documentId: "spec-1", revision: "B" }, "The steering specification requires torque between 18 and 22 Nm.", 0.92)],
    expectedRelevantChunkIds: ["document-answer"],
    expectedSubjectIds: ["subject:steering"],
    expectedApplications: ["windchill"],
    graphRelationships: [],
  },
  {
    id: "graph-plus-document",
    question: "For the established part-to-material relationship, what does the specification say about torque?",
    intent: "document",
    chunks: [fixtureChunk({ chunkId: "graph-doc-support", documentId: "spec-2", revision: "C" }, "For the connected steering part, the required torque range is 18 to 22 Nm.", 0.88)],
    expectedRelevantChunkIds: ["graph-doc-support"],
    expectedSubjectIds: ["subject:steering"],
    expectedApplications: ["windchill"],
    graphRelationships: [{ id: "rel:windchill-sap", authority: "graph" }],
    expectGraphUnchanged: true,
  },
  {
    id: "irrelevant-same-application",
    question: "What does the steering specification require for torque?",
    intent: "document",
    chunks: [
      fixtureChunk({
        chunkId: "relevant-spec",
        documentId: "spec-relevant",
        revision: "A",
        canonicalSubjectIds: ["subject:steering"],
        entityIds: ["wc:part-1"],
      }, "The steering component must remain within its approved torque range.", 0.58),
      fixtureChunk({
        chunkId: "same-app-distractor",
        documentId: "spec-distractor",
        revision: "A",
        canonicalSubjectIds: ["subject:braking"],
        entityIds: ["wc:brake-9"],
      }, "The steering specification torque requirement is repeated in this unrelated general catalog.", 0.75),
    ],
    expectedRelevantChunkIds: ["relevant-spec"],
    expectedSubjectIds: ["subject:steering"],
    expectedApplications: ["windchill"],
    graphRelationships: [],
  },
  {
    id: "same-subject-non-authoritative",
    question: "What background note is available for this steering subject?",
    intent: "document",
    chunks: [fixtureChunk({
      chunkId: "subject-background",
      documentId: "background",
      revision: "A",
      canonicalSubjectIds: ["subject:steering"],
      entityIds: [],
    }, "This note provides background for the steering investigation only.", 0.8)],
    expectedRelevantChunkIds: ["subject-background"],
    expectedSubjectIds: ["subject:steering"],
    expectedApplications: ["windchill"],
    graphRelationships: [],
    expectGraphUnchanged: true,
  },
  {
    id: "access-exclusion",
    question: "What is the steering specification's torque limit?",
    intent: "document",
    chunks: [
      fixtureChunk({
        chunkId: "unauthorized-lexical-best",
        documentId: "restricted-spec",
        revision: "A",
        accessScope: {
          tenantId: "tenant-a",
          classification: "restricted",
          allowedPrincipalIds: ["different-principal"],
          allowedGroupIds: [],
          policyVersion: "acl-v3",
        },
      }, "PRIVATE-UNAUTHORIZED The steering specification torque limit is 24 Nm.", 0.99),
      fixtureChunk({ chunkId: "authorized-lower-match", documentId: "public-spec", revision: "A" }, "The approved torque limit is 22 Nm.", 0.58),
    ],
    expectedRelevantChunkIds: ["authorized-lower-match"],
    expectedSubjectIds: ["subject:steering"],
    expectedApplications: ["windchill"],
    forbiddenChunkIds: ["unauthorized-lexical-best"],
    forbiddenText: ["PRIVATE-UNAUTHORIZED", "different-principal", "https://private.example/restricted-spec"],
    graphRelationships: [],
  },
  {
    id: "authority-conflict",
    question: "What does the document say about torque compared with the graph evidence?",
    intent: "document",
    chunks: [fixtureChunk({
      chunkId: "conflicting-doc",
      documentId: "conflict-doc",
      revision: "A",
    }, "This retrieved document states a 30 Nm limit, which conflicts with the graph-supported 22 Nm value.", 0.85)],
    expectedRelevantChunkIds: ["conflicting-doc"],
    expectedSubjectIds: ["subject:steering"],
    expectedApplications: ["windchill"],
    graphRelationships: [{ id: "rel:graph-authority-22nm", authority: "graph" }],
    expectGraphUnchanged: true,
  },
  {
    id: "insufficient-evidence",
    question: "What steering torque limit is specified?",
    intent: "document",
    chunks: [fixtureChunk({
      chunkId: "unrelated-catalog",
      documentId: "catalog",
      revision: "A",
      canonicalSubjectIds: ["subject:other"],
      entityIds: ["wc:other"],
    }, "Furniture colors include blue and green.", 0)],
    expectedRelevantChunkIds: [],
    expectedSubjectIds: [],
    expectedApplications: [],
    graphRelationships: [],
  },
];

function answerCitations(evidence: readonly RetrievalEvidence[]) {
  return evidence.map((item) => ({ citationIds: [item.citationId] }));
}

describe("fixture retrieval evaluation set", () => {
  it("contains the eight required graph, document, relevance, access, conflict, and insufficiency cases", () => {
    expect(cases.map((item) => item.id)).toEqual([
      "graph-only",
      "document-only",
      "graph-plus-document",
      "irrelevant-same-application",
      "same-subject-non-authoritative",
      "access-exclusion",
      "authority-conflict",
      "insufficient-evidence",
    ]);
  });

  it("evaluates all cases deterministically without network or model calls", async () => {
    const metricsByCase = new Map<string, ReturnType<typeof scoreRetrievalEvaluation>>();
    for (const testCase of cases) {
      const graphBefore = structuredClone(testCase.graphRelationships);
      const query = buildRetrievalQuery({
        originalQuestion: testCase.question,
        intent: testCase.intent,
        investigationId: `eval-${testCase.id}`,
        canonicalSubjectIds: testCase.expectedSubjectIds,
        selectedEntityIds: ["wc:part-1"],
        relationshipEndpointEntityIds: ["sap:material-1"],
        sourceApplicationFilters: [],
        documentTypeFilters: [],
      }, fixturePrincipal);
      let retrievalInvocationCount = 0;
      const result = query
        ? await (async () => {
            retrievalInvocationCount += 1;
            return retrieveEvidence({
              query,
              index: new InMemoryRetrievalIndex(testCase.chunks, new FixtureSemanticScorer(
                Object.fromEntries(testCase.chunks.map((chunk) => [chunk.metadata.chunkId, chunk.semanticScore])),
              )),
              accessPolicy: fixtureAccessPolicy,
              diagnosticsStore: { persist: async () => undefined },
              requestId: `request-${testCase.id}`,
              snapshotRevision: 3,
              now: "2026-11-11T00:00:00.000Z",
              clock: (() => { let time = 0; return () => (time += 12); })(),
            });
          })()
        : {
            schemaVersion: "1.0" as const,
            status: "complete" as const,
            evidence: [] as readonly RetrievalEvidence[],
            diagnostics: {
              schemaVersion: "1.0" as const,
              requestId: `request-${testCase.id}`,
              investigationId: `eval-${testCase.id}`,
              snapshotRevision: 3,
              query: { originalQuestion: testCase.question, normalizedQuestion: testCase.question, intent: testCase.intent, keywordQuery: "", semanticQuery: "" },
              candidateCount: 0,
              filteredCount: 0,
              selectedCount: 0,
              rejectedCandidates: [],
              scoreBreakdowns: [],
              selectedChunkIds: [],
              duplicateChunkIds: [],
              omissionReasonCodes: [],
              retrievalDurationMs: 0,
              contextCharactersConsumed: 0,
            },
          };
      expect(retrievalInvocationCount, testCase.id).toBe(query ? 1 : 0);

      const budget = allocateRetrievalBudget({
        protectedCharacters: 8_000,
        evidence: result.evidence,
      });
      const claims = answerCitations(result.evidence);
      const metrics = scoreRetrievalEvaluation({
        expectedRelevantChunkIds: testCase.expectedRelevantChunkIds,
        expectedSubjectIds: testCase.expectedSubjectIds,
        expectedApplications: testCase.expectedApplications,
        requiredCitationIds: testCase.expectedRelevantChunkIds.flatMap((chunkId) => {
          const expectedChunk = testCase.chunks.find((item) => item.metadata.chunkId === chunkId);
          return expectedChunk
            ? [retrievalCitationId(expectedChunk.metadata.documentId, expectedChunk.metadata.revision, chunkId)]
            : [];
        }),
        claims,
        forbiddenChunkIds: testCase.forbiddenChunkIds ?? [],
        forbiddenText: testCase.forbiddenText ?? [],
        result,
        budget,
        hardLimit: 24_000,
        retrievalLatencyMs: result.diagnostics.retrievalDurationMs,
      });
      metricsByCase.set(testCase.id, metrics);

      expect(metrics.recallAt5, testCase.id).toBe(1);
      expect(metrics.recallAt10, testCase.id).toBe(1);
      expect(metrics.meanReciprocalRank, testCase.id).toBe(1);
      expect(metrics.citationPrecision, testCase.id).toBe(1);
      expect(metrics.citationCompleteness, testCase.id).toBe(1);
      expect(metrics.accessFilterCorrectness, testCase.id).toBe(1);
      expect(metrics.unauthorizedTextLeakageCount, testCase.id).toBe(0);
      expect(metrics.unsupportedClaimRate, testCase.id).toBe(0);
      expect(metrics.contextBudgetCompliance, testCase.id).toBe(1);
      expect(metrics.retrievalLatencyMs, testCase.id).toBe(query ? 12 : 0);
      expect(metrics.subjectRelevance, testCase.id).toBe(testCase.id === "irrelevant-same-application" ? 0.5 : 1);
      expect(metrics.applicationRelevance, testCase.id).toBe(1);
      expect(testCase.expectGraphUnchanged ? testCase.graphRelationships : graphBefore).toEqual(graphBefore);
    }

    expect(metricsByCase.size).toBe(8);
    const metricRows = [...metricsByCase.entries()];
    const average = (select: (value: ReturnType<typeof scoreRetrievalEvaluation>) => number) =>
      metricRows.reduce((sum, [, value]) => sum + select(value), 0) / metricRows.length;
    expect({
      recallAt5: average((item) => item.recallAt5),
      recallAt10: average((item) => item.recallAt10),
      meanReciprocalRank: average((item) => item.meanReciprocalRank),
      citationPrecision: average((item) => item.citationPrecision),
      citationCompleteness: average((item) => item.citationCompleteness),
      subjectRelevance: average((item) => item.subjectRelevance),
      applicationRelevance: average((item) => item.applicationRelevance),
      accessFilterCorrectness: average((item) => item.accessFilterCorrectness),
      unauthorizedTextLeakageCount: metricRows.reduce((sum, [, value]) => sum + value.unauthorizedTextLeakageCount, 0),
      unsupportedClaimRate: average((item) => item.unsupportedClaimRate),
      contextBudgetCompliance: average((item) => item.contextBudgetCompliance),
      meanRetrievalLatencyMs: average((item) => item.retrievalLatencyMs),
    }).toEqual({
      recallAt5: 1,
      recallAt10: 1,
      meanReciprocalRank: 1,
      citationPrecision: 1,
      citationCompleteness: 1,
      subjectRelevance: 0.9375,
      applicationRelevance: 1,
      accessFilterCorrectness: 1,
      unauthorizedTextLeakageCount: 0,
      unsupportedClaimRate: 0,
      contextBudgetCompliance: 1,
      meanRetrievalLatencyMs: 10.5,
    });
    const distractorResult = await retrieveEvidence({
      query: buildRetrievalQuery({
        originalQuestion: cases[3].question,
        intent: "document",
        investigationId: "eval-distractor-rank",
        canonicalSubjectIds: ["subject:steering"],
        selectedEntityIds: ["wc:part-1"],
        relationshipEndpointEntityIds: [],
        sourceApplicationFilters: [],
        documentTypeFilters: [],
      }, fixturePrincipal)!,
      index: new InMemoryRetrievalIndex(cases[3].chunks),
      accessPolicy: fixtureAccessPolicy,
      diagnosticsStore: { persist: async () => undefined },
      requestId: "rank-check",
      snapshotRevision: 1,
      now: "2026-11-11T00:00:00.000Z",
    });
    expect(distractorResult.evidence[0]?.chunkId).toBe("relevant-spec");
    const insufficient = metricsByCase.get("insufficient-evidence")!;
    expect(insufficient.recallAt10).toBe(1);
    expect(insufficient.citationCompleteness).toBe(1);
  });

  it("keeps retrieved authority separate when retrieved text conflicts with graph authority", async () => {
    const conflict = cases.find((item) => item.id === "authority-conflict")!;
    const before = structuredClone(conflict.graphRelationships);
    const query = buildRetrievalQuery({
      originalQuestion: conflict.question,
      intent: "document",
      investigationId: "eval-conflict",
      canonicalSubjectIds: ["subject:steering"],
      selectedEntityIds: ["wc:part-1"],
      relationshipEndpointEntityIds: ["sap:material-1"],
      sourceApplicationFilters: [],
      documentTypeFilters: [],
    }, fixturePrincipal)!;
    const result = await retrieveEvidence({
      query,
      index: new InMemoryRetrievalIndex(conflict.chunks),
      accessPolicy: fixtureAccessPolicy,
      diagnosticsStore: { persist: async () => undefined },
      requestId: "request-conflict",
      snapshotRevision: 1,
      now: "2026-11-11T00:00:00.000Z",
    });

    expect(conflict.graphRelationships).toEqual(before);
    expect(result.evidence[0]).toMatchObject({
      provenance: { authority: "retrieved-document" },
      excerpt: expect.stringContaining("30 Nm"),
    });
    expect(result.evidence[0]).not.toHaveProperty("relationshipId");
    expect(result.evidence[0]).not.toHaveProperty("impactPath");
  });
});
