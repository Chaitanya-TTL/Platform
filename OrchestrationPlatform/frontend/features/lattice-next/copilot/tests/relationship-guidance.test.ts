import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseRelationshipGuidance,
  selectRelationshipGuidance,
} from "../relationship-guidance";

const relationshipDocument = readFileSync(
  resolve(process.cwd(), "..", "docs", "relationships.md"),
  "utf8",
);
const sections = parseRelationshipGuidance(relationshipDocument);

describe("authoritative relationship guidance", () => {
  it("selects only the requested directed application sections", () => {
    const selected = selectRelationshipGuidance(sections, [
      { sourceApplication: "windchill", targetApplication: "sap" },
    ]);

    expect(selected).toContainEqual(expect.objectContaining({
      sourceApplication: "Windchill",
      targetApplication: "SAP",
    }));
    expect(selected.every((section) => (
      section.sourceApplication === "Windchill" &&
      section.targetApplication === "SAP"
    ))).toBe(true);
  });

  it("retains the potential-impact and causation limit", () => {
    const windchillSap = selectRelationshipGuidance(sections, [
      { sourceApplication: "windchill", targetApplication: "sap" },
    ])[0];

    expect(windchillSap.content).toContain("MAY_IMPACT");
    expect(windchillSap.content).toMatch(/must never be claimed to have caused/i);
  });

  it("does not infer an undocumented Teamcenter pair", () => {
    expect(selectRelationshipGuidance(sections, [
      { sourceApplication: "teamcenter", targetApplication: "sap" },
    ])).toEqual([]);
  });

  it("selects the documented Codebeamer-to-Configit section", () => {
    const selected = selectRelationshipGuidance(sections, [
      { sourceApplication: "codebeamer", targetApplication: "configit" },
    ]);

    expect(selected).toContainEqual(expect.objectContaining({
      sourceApplication: "Codebeamer",
      targetApplication: "Configit",
    }));
    expect(selected[0]?.content).toContain("Codebeamer Requirement Set");
  });

  it("ignores non-pair and nested headings while preserving section content", () => {
    const parsed = parseRelationshipGuidance([
      "# Relationship model",
      "## Windchill-centred relationships",
      "### 8.1 Windchill to SAP",
      "Pair content.",
      "#### Detailed semantics",
      "Nested content.",
      "### 8.2 SAP to Configit",
      "Second pair.",
      "## End matter",
      "### Windchill",
      "Not a pair.",
    ].join("\n"));

    expect(parsed).toHaveLength(2);
    expect(parsed[0].content).toContain("#### Detailed semantics");
    expect(parsed[0].content).toContain("Nested content.");
    expect(parsed[0].content).not.toContain("Second pair.");
  });
});
