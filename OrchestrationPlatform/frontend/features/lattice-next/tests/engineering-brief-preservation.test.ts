import { describe, expect, it } from "vitest";
import { buildInvestigationContext, engineeringPromptPayload } from "../copilot/context-builder";
import {
  buildSprint1A5GoldenInvestigation,
  buildSprint1A5Snapshot,
  relationshipsDocument,
} from "./sprint-1a5-fixture-support";

const questions = [
  "Which applications are involved in this investigation and how are they connected?",
  "What operational consequence follows from this Windchill part being represented as a SAP material?",
];

describe("engineering brief reasoning preservation", () => {
  it.each(questions)("preserves reasoning from package through prompt for: %s", (question) => {
    const packet = buildInvestigationContext(
      buildSprint1A5Snapshot(buildSprint1A5GoldenInvestigation()),
      question,
      { relationshipDocument: relationshipsDocument },
    );
    const payload = engineeringPromptPayload(question, packet);

    expect(packet.engineeringBrief.relationshipNarratives.length).toBeGreaterThanOrEqual(1);
    expect(packet.engineeringBrief.impactNarratives.length).toBeGreaterThanOrEqual(1);
    expect(packet.engineeringBrief.topImpactChains.length).toBeGreaterThanOrEqual(1);
    expect(payload.engineeringBrief.relationshipNarratives.length).toBeGreaterThanOrEqual(1);
    expect(payload.engineeringBrief.impactNarratives.length).toBeGreaterThanOrEqual(1);
    expect(payload.topImpactChains.length).toBeGreaterThanOrEqual(1);
    expect(payload.engineeringBrief.majorRelationships.length).toBeGreaterThan(0);
    expect(payload.engineeringBrief.relationshipEvidence.length).toBeGreaterThan(0);
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(packet.omissions.maxContextChars);
  });
});
