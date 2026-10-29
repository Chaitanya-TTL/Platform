import { describe, expect, it } from "vitest";
import { resolveUniversalRelationships } from "../../index";
import type { EngineeringProvenance, IntelligenceEntity, IntelligenceProperty } from "../../../contracts/intelligence-v1";

const text = (value: string): IntelligenceProperty => ({ type: "text", text: value });

const entity = (
  id: string,
  source: "windchill" | "sap" | "configit" | "codebeamer",
  kind: string,
  nativeId: string,
  properties: Record<string, IntelligenceProperty> = {},
): IntelligenceEntity => ({
  id,
  kind,
  displayName: id,
  identityQuality: "native",
  assertion: "fact",
  properties,
  provenance: {
    source,
    provider: `${source}-connector`,
    nativeId,
    observedAt: "2026-01-01T00:00:00Z",
    authority: "source-authoritative",
  } satisfies EngineeringProvenance,
  temporal: {
    capturedAt: "2026-01-01T00:00:00Z",
    assembledAt: "2026-01-01T00:00:00Z",
    freshness: "current",
  },
});

const participating = (
  id: string,
  source: "windchill" | "sap" | "configit",
): IntelligenceEntity => entity(id, source, "source-representation", `${source}-native-${id}`, {
  sourceRole: text("participating-source-subject"),
});

describe("approved pilot relationships", () => {
  it("confirms selected endpoints without comparing their native identifiers", () => {
    const codebeamerRequirement = entity("cb-77", "codebeamer", "requirement", "CB-REQ-77", {
      presentationRole: text("selected-requirement"),
    });
    const codebeamerParent = entity("cb-parent", "codebeamer", "requirement", "CB-SET-12", {
      relationshipContext: text("parent"),
    });
    const scenarios = [
      { ruleId: "WC_PART_TO_SAP_MATERIAL", source: participating("wc-1", "windchill"), target: participating("sap-1", "sap") },
      { ruleId: "WC_PART_TO_CONFIGIT_MODEL", source: participating("wc-2", "windchill"), target: participating("configit-2", "configit") },
      { ruleId: "WC_PART_TO_CB_REQUIREMENT", source: participating("wc-3", "windchill"), target: codebeamerRequirement },
      { ruleId: "SAP_MATERIAL_TO_CONFIGIT_MODEL", source: participating("sap-4", "sap"), target: participating("configit-4", "configit") },
      { ruleId: "CB_REQUIREMENT_SET_TO_CONFIGIT_MODEL", source: codebeamerParent, target: participating("configit-5", "configit") },
    ];

    for (const scenario of scenarios) {
      const result = resolveUniversalRelationships(
        [scenario.source, scenario.target],
        "2026-01-02T00:00:00Z",
      );

      expect(result.relationships).toHaveLength(1);
      expect(result.relationships[0]).toMatchObject({
        ruleId: scenario.ruleId,
        status: "confirmed",
        approvalBasis: "domain-owner-confirmed",
      });
      expect(result.evidence[0]).toMatchObject({
        mechanism: "domain-owner-approved-pilot",
        approvalBasis: "domain-owner-confirmed",
        source: { value: scenario.source.provenance.nativeId },
        target: { value: scenario.target.provenance.nativeId },
      });
      expect(result.evidence[0].source.value).not.toBe(result.evidence[0].target.value);
    }
  });
});