import { describe, expect, it } from "vitest";
import { buildInvestigationContext } from "../copilot/context-builder";
import {
  buildSprint1A5GoldenInvestigation,
  buildSprint1A5Snapshot,
  relationshipsDocument,
} from "./sprint-1a5-fixture-support";

describe("Sprint 1A.5 protected relationship context", () => {
  it("retains a complete governed relationship group under the production context budget", () => {
    const canonical = buildSprint1A5GoldenInvestigation();
    const packet = buildInvestigationContext(
      buildSprint1A5Snapshot(canonical),
      "Which applications are involved and how are they connected?",
      { relationshipDocument: relationshipsDocument },
    );
    const retained = packet.relationships[0];
    expect(packet.relationships.length).toBeGreaterThan(0);
    expect(packet.evidence.length).toBeGreaterThan(0);
    if (!retained) throw new Error("Protected governed relationship was not retained.");
    expect(packet.entities.some((entity) => entity.entityId === retained.sourceEntityId)).toBe(true);
    expect(packet.entities.some((entity) => entity.entityId === retained.targetEntityId)).toBe(true);
    expect(retained.evidenceCitationIds.length).toBeGreaterThan(0);
    expect(packet.evidence.some((item) =>
      item.summary.includes("mappingReference=PLM-RELATIONSHIP-BIBLE-V1") &&
      item.summary.includes("handshakeEvidenceId="),
    )).toBe(true);
    expect(packet.omissions.budgetTrace.protectedRelationshipId).toBe(retained.relationshipId);
  });

  it("fails explicitly when the minimum context cannot retain protected reasoning", () => {
    const canonical = buildSprint1A5GoldenInvestigation();
    expect(() => buildInvestigationContext(
      buildSprint1A5Snapshot(canonical),
      "What operational consequence follows from this Windchill part being represented as a SAP material?",
      { maxContextChars: 2_048, relationshipDocument: relationshipsDocument },
    )).toThrow(/Context budget exceeded[\s\S]*impact narratives[\s\S]*impact chains[\s\S]*2048/);
  });
});
