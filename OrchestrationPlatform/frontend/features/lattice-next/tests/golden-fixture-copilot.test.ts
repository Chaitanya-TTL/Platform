import { describe, expect, it } from "vitest";
import { buildInvestigationContext, engineeringPromptPayload } from "../copilot/context-builder";
import {
  buildSprint1A5GoldenInvestigation,
  buildSprint1A5Snapshot,
  relationshipsDocument,
} from "./sprint-1a5-fixture-support";

describe("Sprint 1A.5 golden fixture Copilot context", () => {
  it("includes relationship-backed applications and evidence in the M1 prompt payload", () => {
    const question = "Which applications are involved in this investigation and how are they connected?";
    const canonical = buildSprint1A5GoldenInvestigation();
    const packet = buildInvestigationContext(buildSprint1A5Snapshot(canonical), question, {
      relationshipDocument: relationshipsDocument,
    });
    const payload = engineeringPromptPayload(question, packet);
    const relationshipCount = payload.engineeringBrief.relationshipFlow.promptPayload.relationshipCount;
    const evidenceCount = payload.engineeringBrief.relationshipFlow.promptPayload.evidenceCount;
    const applicationNames = payload.engineeringBrief.majorRelationships.flatMap((relationship) => [
      relationship.summary,
      relationship.kind,
    ]).join(" ");
    expect(relationshipCount).toBeGreaterThan(0);
    expect(evidenceCount).toBeGreaterThan(0);
    expect(applicationNames).toContain("windchill");
    expect(applicationNames).toContain("sap");
  });

  it("includes the Windchill-to-SAP relationship and provenance in the M2 prompt payload", () => {
    const question = "What operational consequence follows from this Windchill part being represented as a SAP material?";
    const canonical = buildSprint1A5GoldenInvestigation();
    const packet = buildInvestigationContext(buildSprint1A5Snapshot(canonical), question, {
      relationshipDocument: relationshipsDocument,
    });
    const payload = engineeringPromptPayload(question, packet);
    const sapRelationship = payload.engineeringBrief.majorRelationships.find((relationship) =>
      relationship.kind === "operationally-represented-as" &&
      relationship.provenance?.provider === "lattice-relationship-ontology",
    );
    expect(sapRelationship).toBeDefined();
    expect(sapRelationship?.evidenceCitationIds.length).toBeGreaterThan(0);
    expect(payload.engineeringBrief.relationshipEvidence.some((item) =>
      item.summary.includes("mappingId=MAP-WC-SAP-001") &&
      item.summary.includes("mappingReference=PLM-RELATIONSHIP-BIBLE-V1"),
    )).toBe(true);
  });
});
