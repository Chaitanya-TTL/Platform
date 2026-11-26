import { describe, expect, it } from "vitest";
import { retrievalCitationId } from "../retrieval-citation";

describe("retrieval citation IDs", () => {
  it("encodes each document, revision, and chunk component independently", () => {
    expect(retrievalCitationId("doc:one", "rev/2", "chunk #3"))
      .toBe("cite:retrieval-document:v1:doc%3Aone:rev%2F2:chunk%20%233");
  });

  it("is deterministic and sensitive to both revision and exact chunk identity", () => {
    const citation = retrievalCitationId("doc-1", "A", "chunk-1");

    expect(retrievalCitationId("doc-1", "A", "chunk-1")).toBe(citation);
    expect(retrievalCitationId("doc-1", "B", "chunk-1")).not.toBe(citation);
    expect(retrievalCitationId("doc-1", "A", "chunk-2")).not.toBe(citation);
    expect(retrievalCitationId("doc-2", "A", "chunk-1")).not.toBe(citation);
  });

  it("uses a namespace distinct from existing entity, relationship, evidence, and source citations", () => {
    const retrievalId = retrievalCitationId("doc-1", "A", "chunk-1");
    const existingIds = [
      "cite:entity:doc-1",
      "cite:relationship:doc-1",
      "cite:evidence:doc-1",
      "cite:source:doc-1",
      "cite:evaluation:doc-1",
      "cite:finding:doc-1",
    ];

    expect(existingIds).not.toContain(retrievalId);
    expect(retrievalId).toMatch(/^cite:retrieval-document:v1:/);
  });

  it.each([
    ["", "revision", "chunk"],
    ["document", " ", "chunk"],
    ["document", "revision", "\t"],
  ])("rejects a blank citation component", (documentId, revision, chunkId) => {
    expect(() => retrievalCitationId(documentId, revision, chunkId)).toThrow(/non-empty/i);
  });
});
