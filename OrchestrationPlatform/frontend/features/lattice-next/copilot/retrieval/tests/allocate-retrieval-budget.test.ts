import { describe, expect, it } from "vitest";
import type { RetrievalEvidence } from "../contracts";
import { allocateRetrievalBudget } from "../allocate-retrieval-budget";

function evidence(chunkId: string, retrievalScore: number, excerpt = `Evidence for ${chunkId}`): RetrievalEvidence {
  return {
    schemaVersion: "1.0",
    evidenceId: `retrieval-evidence:${chunkId}`,
    citationId: `cite:retrieval-document:v1:doc:A:${chunkId}`,
    chunkId,
    documentId: "doc",
    sourceApplication: "windchill",
    excerpt,
    sectionPath: ["Specification"],
    revision: "A",
    sourceReference: { sourceSystem: "Windchill", nativeDocumentId: "DOC-1" },
    retrievalScore,
    accessDecision: { decision: "allowed", policyVersion: "acl-v3", decidedAt: "2026-11-11T00:00:00.000Z" },
    provenance: {
      authority: "retrieved-document",
      sourceSystem: "Windchill",
      extractedAt: "2026-11-01T00:00:00.000Z",
      contentHash: `hash:${chunkId}`,
    },
  };
}

describe("retrieval context budget allocation", () => {
  it("preserves protected context, reserves space, and respects primer and retrieval caps", () => {
    const result = allocateRetrievalBudget({
      protectedCharacters: 15_000,
      primer: "A".repeat(1_200),
      evidence: [evidence("first", 0.9), evidence("second", 0.8)],
    });

    expect(result.protectedCharacters).toBe(15_000);
    expect(result.primer?.length).toBeLessThanOrEqual(1_000);
    expect(result.retrievalCharactersConsumed).toBeLessThanOrEqual(6_000);
    expect(result.totalCharacters).toBeLessThanOrEqual(24_000 - 1_500);
    expect(result.remainingReserve).toBeGreaterThanOrEqual(1_500);
  });

  it("keeps evidence in rank order and omits the lowest-ranked chunks first", () => {
    const ranked = [
      evidence("highest", 0.99, "H".repeat(500)),
      evidence("middle", 0.8, "M".repeat(500)),
      evidence("lowest", 0.1, "L".repeat(500)),
    ];
    const allSerialized = JSON.stringify(ranked).length;
    const result = allocateRetrievalBudget({
      protectedCharacters: 0,
      evidence: ranked,
      hardLimit: allSerialized - 1,
      reserveCharacters: 0,
      primerMaximum: 0,
      retrievalMaximum: 6_000,
    });

    expect(result.evidence.map((item) => item.chunkId)).toEqual(["highest", "middle"]);
    expect(result.omissionReasonCodes).toContain("retrieval-budget-exceeded");
  });

  it("does not add optional content when only the safety reserve remains", () => {
    const result = allocateRetrievalBudget({
      protectedCharacters: 2_500,
      primer: "primer",
      evidence: [evidence("chunk", 1)],
      hardLimit: 4_000,
      reserveCharacters: 1_500,
    });

    expect(result.primer).toBeUndefined();
    expect(result.evidence).toEqual([]);
    expect(result.totalCharacters).toBe(2_500);
    expect(result.remainingReserve).toBe(1_500);
  });

  it("preserves protected context and reports the existing over-budget condition", () => {
    const protectedCharacters = 24_001;
    const result = allocateRetrievalBudget({
      protectedCharacters,
      primer: "must not enter",
      evidence: [evidence("must-not-enter", 1)],
    });

    expect(result.protectedCharacters).toBe(protectedCharacters);
    expect(result.primer).toBeUndefined();
    expect(result.evidence).toEqual([]);
    expect(result.budgetExceeded).toBe(true);
    expect(result.omissionReasonCodes).toContain("protected-context-over-limit");
  });

  it("counts serialized evidence and primer safely at an exact-fit boundary", () => {
    const primer = "Safety context";
    const item = evidence("exact", 0.9);
    const added = JSON.stringify(primer).length + JSON.stringify([item]).length;
    const result = allocateRetrievalBudget({
      protectedCharacters: 1_000,
      primer,
      evidence: [item],
      hardLimit: 1_000 + added,
      reserveCharacters: 0,
      primerMaximum: 1_000,
      retrievalMaximum: 6_000,
    });

    expect(result.evidence).toEqual([item]);
    expect(result.primer).toBe(primer);
    expect(result.totalCharacters).toBe(1_000 + added);
    expect(result.budgetExceeded).toBe(false);
  });
});
