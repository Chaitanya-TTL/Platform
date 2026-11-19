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

describe("reasoning intelligence budget preservation", () => {
  it.each(questions)("preserves available reasoning artifacts within budget for: %s", (question) => {
    const packet = buildInvestigationContext(
      buildSprint1A5Snapshot(buildSprint1A5GoldenInvestigation()),
      question,
      { relationshipDocument: relationshipsDocument },
    );

    expect(packet.reasoningPackage.relationshipNarratives.length).toBeGreaterThanOrEqual(1);
    expect(packet.reasoningPackage.impactNarratives.length).toBeGreaterThanOrEqual(1);
    expect(packet.reasoningPackage.impactChains.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(packet.omissions.maxContextChars);
  });

  it("fails with protected-category diagnostics when the minimum packet budget cannot fit", () => {
    const canonical = buildSprint1A5GoldenInvestigation();

    expect(() => buildInvestigationContext(
      buildSprint1A5Snapshot(canonical),
      questions[1],
      { maxContextChars: 2_048, relationshipDocument: relationshipsDocument },
    )).toThrow(/Context budget exceeded[\s\S]*relationship narratives[\s\S]*impact narratives[\s\S]*impact chains[\s\S]*2048/);
  });
});
