import { describe, expect, it } from "vitest";
import { buildInvestigationContext } from "../copilot/context-builder";
import {
  buildSprint1A5GoldenInvestigation,
  buildSprint1A5Snapshot,
  relationshipsDocument,
} from "./sprint-1a5-fixture-support";

describe("Sprint 1A.5 relationship context", () => {
  it("retains complete governed relationship groups with their supporting evidence", () => {
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
  });

  it("preserves every relationship and evidence record when context exceeds historical budgets", () => {
    const canonical = buildSprint1A5GoldenInvestigation();
    const packet = buildInvestigationContext(
      buildSprint1A5Snapshot(canonical),
      "What operational consequence follows from this Windchill part being represented as a SAP material?",
      { relationshipDocument: relationshipsDocument },
    );
    expect(packet.relationships.map((item) => item.relationshipId)).toEqual(
      expect.arrayContaining(canonical.relationships.map((item) => item.id)),
    );
    expect(packet.omissions.categories).toEqual([]);
  });
});
