import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { projectedNodeDimensions } from "../motion/node-sizing";
import { normalizeCodebeamerValue } from "../engines/codebeamer-display-value";
import type { ProjectedNode } from "../contracts/projection";

const node = (role: string, value = "", hasChildren = false): ProjectedNode => ({
  id: `node:${role}`,
  label: role === "detail-group" ? "Overview" : "Description",
  subtitle: role === "detail-group" ? "2 fields" : "Requirement description",
  kind: "requirement-detail",
  source: "codebeamer",
  level: 5,
  selected: false,
  expanded: false,
  hasChildren,
  hiddenChildren: hasChildren ? 2 : 0,
  attributes: { presentationRole: role, value },
  relationshipCount: 1,
  childCount: hasChildren ? 2 : 0,
});

describe("L-CB5D.3 premium Codebeamer node UI", () => {
  it("gives semantic group parents compact parent dimensions", () => {
    expect(projectedNodeDimensions(node("detail-group", "", true))).toEqual({ width: 360, height: 138 });
  });

  it("gives descriptions a wide contained card", () => {
    expect(projectedNodeDimensions(node("description", "x".repeat(500)))).toEqual({ width: 720, height: 238 });
    expect(projectedNodeDimensions(node("description", "x".repeat(260)))).toEqual({ width: 640, height: 238 });
    expect(projectedNodeDimensions(node("description", "x".repeat(120)))).toEqual({ width: 560, height: 238 });
  });

  it("keeps scalar detail leaves compact", () => {
    const dimensions = projectedNodeDimensions(node("detail-field", "Should have"));
    expect(dimensions.width).toBeGreaterThanOrEqual(320);
    expect(dimensions.width).toBeLessThanOrEqual(520);
    expect(dimensions.height).toBe(148);
  });

  it("normalizes compact numbered prose into readable lines", () => {
    const result = normalizeCodebeamerValue("Supported configurations:1. Hydraulic2. Electric3. Manual");
    expect(result.text).toBe("Supported configurations:\n1. Hydraulic\n2. Electric\n3. Manual");
  });

  it("renders parent groups without scalar Unavailable output", () => {
    const source = readFileSync(fileURLToPath(new URL("../components/PremiumNodes.tsx", import.meta.url)), "utf8");
    const groupStart = source.indexOf("{isDetailGroup ? (");
    const leafStart = source.indexOf(") : isRequirementDetail ? (", groupStart);
    const groupBranch = source.slice(groupStart, leafStart);
    expect(groupBranch).toContain("{data.subtitle}");
    expect(groupBranch).toContain("{data.label}");
    expect(groupBranch).not.toContain("{value}");
    expect(groupBranch).not.toContain("Unavailable");
  });

  it("keeps Read more and Show less inside the description card", () => {
    const source = readFileSync(fileURLToPath(new URL("../components/PremiumNodes.tsx", import.meta.url)), "utf8");
    expect(source).toContain('overflow-y-auto overscroll-contain');
    expect(source).toContain('showFullValue ? "Show less" : "Read more"');
    expect(source).toContain("geometrySignal={showFullValue ? 1 : 0}");
  });

  it("makes the premium node fill and clip to the React Flow geometry", () => {
    const source = readFileSync(fileURLToPath(new URL("../components/PremiumNodes.tsx", import.meta.url)), "utf8");
    expect(source).toContain("flex h-full w-full min-w-0");
    expect(source).toContain("overflow-hidden rounded-2xl");
  });
});
