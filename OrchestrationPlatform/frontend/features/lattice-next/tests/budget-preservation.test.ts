import { describe, expect, it } from "vitest";
import { buildInvestigationContext } from "../copilot/context-builder";
import {
  buildSprint1A5GoldenInvestigation,
  buildSprint1A5Snapshot,
  relationshipsDocument,
} from "./sprint-1a5-fixture-support";

const questions = [
  "Which applications are involved in this investigation and how are they connected?",
  "What operational consequence follows from this Windchill part being represented as a SAP material?",
];

describe("reasoning intelligence preservation", () => {
  it.each(questions)("preserves all available reasoning artifacts for: %s", (question) => {
    const packet = buildInvestigationContext(
      buildSprint1A5Snapshot(buildSprint1A5GoldenInvestigation()),
      question,
      { relationshipDocument: relationshipsDocument },
    );

    expect(packet.reasoningPackage.relationshipNarratives.length).toBeGreaterThanOrEqual(1);
    expect(packet.reasoningPackage.impactNarratives.length).toBeGreaterThanOrEqual(1);
    expect(packet.reasoningPackage.impactChains.length).toBeGreaterThanOrEqual(1);
    expect(packet.omissions.categories).toEqual([]);
  });

  it("preserves complete reasoning when the packet is larger than historical budgets", () => {
    const canonical = buildSprint1A5GoldenInvestigation();

    const packet = buildInvestigationContext(
      buildSprint1A5Snapshot(canonical),
      questions[1],
      { relationshipDocument: relationshipsDocument },
    );

    expect(packet.impactPaths).toHaveLength(canonical.knowledgeGraph?.impactPaths.length ?? 0);
    expect(packet.reasoningPackage.impactChains.length).toBeGreaterThan(0);
  });
});
