import { describe, expect, it } from "vitest";
import { parseNavigableCitationId } from "../copilot/citation-id";

describe("parseNavigableCitationId", () => {
  it("decodes canonical entity and relationship citations", () => {
    expect(
      parseNavigableCitationId({
        kind: "entity",
        citationId: "cite:entity:part%2F123",
      }),
    ).toEqual({ kind: "entity", id: "part/123" });
    expect(
      parseNavigableCitationId({
        kind: "relationship",
        citationId: "cite:relationship:edge%3A1",
      }),
    ).toEqual({ kind: "relationship", id: "edge:1" });
  });

  it.each([
    ["plain reference", "entity", "reference-1"],
    ["wrong prefix", "entity", "cite:source:part-1"],
    ["empty ID", "entity", "cite:entity:"],
    ["malformed percent escape", "entity", "cite:entity:part%2"],
    ["lowercase non-canonical escape", "entity", "cite:entity:part%2f123"],
    ["unnecessary encoding", "entity", "cite:entity:part%41"],
    ["wrong-kind prefix", "entity", "cite:relationship:edge-1"],
  ] as const)("rejects %s", (_description, kind, citationId) => {
    expect(
      parseNavigableCitationId({
        kind,
        citationId,
      }),
    ).toBeUndefined();
  });

  it("does not treat non-graph citations as navigable", () => {
    expect(
      parseNavigableCitationId({
        kind: "evidence",
        citationId: "cite:entity:part-1",
      }),
    ).toBeUndefined();
  });
});
