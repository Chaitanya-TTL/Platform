import { describe, expect, it } from "vitest";
import { InvestigationCommandHandler } from "../application/investigation-command-handler";
import { reduceInvestigationEvent } from "../application/investigation-event-reducer";
import { retainFailedSourceValues, summarizeEntityChanges } from "../application/refresh-canonical";
import { SourceExecutionCoordinator } from "../application/source-execution-coordinator";
import { assessExecutionResult } from "../application/stale-result-guard";
import type { EngineeringIntelligenceInvestigationV1, IntelligenceEntity } from "../../contracts/intelligence-v1";
import { asCorrelationId, asExecutionId, asInvestigationId } from "../contracts/investigation-identity";
import { draftSnapshot } from "./kernel-fixtures";
import { InvestigationKernel } from "../application/investigation-kernel";
import { InMemoryInvestigationEventStore } from "./in-memory-event-store";
import { InMemoryInvestigationRepository } from "./in-memory-investigation-repository";
import { FakeSourceExecutionAdapter } from "./fake-source-execution-adapter";

const ids = {
  investigationId: () => asInvestigationId("generated"),
  executionId: () => asExecutionId("execution"),
  correlationId: () => asCorrelationId("correlation"),
  eventId: () => "event-refresh",
};

function entity(id: string, source: "windchill" | "sap", displayName: string): IntelligenceEntity {
  return {
    id,
    kind: "engineering-item",
    displayName,
    identityQuality: "native",
    assertion: "fact",
    properties: {},
    provenance: { source, provider: "test", observedAt: "2026-01-01T00:00:00.000Z", authority: "source-authoritative" },
    temporal: { assembledAt: "2026-01-01T00:00:00.000Z", freshness: "current" },
  };
}

function canonical(entities: IntelligenceEntity[], sources: EngineeringIntelligenceInvestigationV1["sources"]): EngineeringIntelligenceInvestigationV1 {
  return {
    contractVersion: "1.0",
    investigationId: "investigation-1",
    subject: {
      id: "subject-1",
      displayName: "Assembly",
      candidateIds: [],
      confidence: "high",
      reasons: [],
      provenance: { provider: "test", observedAt: "2026-01-01T00:00:00.000Z", authority: "backend-derived" },
      temporal: { assembledAt: "2026-01-01T00:00:00.000Z", freshness: "current" },
    },
    entities,
    relationships: [],
    evidence: [],
    findings: [],
    sources,
    identityClusters: [],
    temporal: { assembledAt: "2026-01-01T00:00:00.000Z", freshness: "current" },
    summary: { entityCount: entities.length, relationshipCount: 0, evidenceCount: 0, findingCount: 0, availableSourceCount: sources.length, partialSourceCount: 0, status: "success" },
  };
}

describe("explicit investigation refresh", () => {
  it("rejects an outdated expected revision and advances revision and epoch on refresh", () => {
    const handler = new InvestigationCommandHandler(ids);
    const snapshot = { ...draftSnapshot(), lifecycle: "ready" as const };

    expect(() => handler.handle({
      type: "refresh",
      investigationId: snapshot.identity.investigationId,
      expectedRevision: 0,
      occurredAt: "2026-01-02T00:00:00.000Z",
    }, snapshot, 0)).toThrow(/revision conflict/i);

    const event = handler.handle({
      type: "refresh",
      investigationId: snapshot.identity.investigationId,
      expectedRevision: snapshot.identity.revision,
      occurredAt: "2026-01-02T00:00:00.000Z",
    }, snapshot, 0)[0];
    expect(event).toMatchObject({
      type: "investigation-refreshed",
      identity: { revision: snapshot.identity.revision + 1, executionEpoch: snapshot.identity.executionEpoch + 1 },
    });
  });

  it("preserves the prior canonical publication while refresh is running", () => {
    const base = draftSnapshot();
    const snapshot = {
      ...base,
      lifecycle: "ready" as const,
      acceptedEvidenceIds: ["evidence:prior"],
      canonical: { revision: base.identity.revision, publishedAt: "2026-01-01T00:00:00.000Z", value: { preserved: true } },
    };
    const [event] = new InvestigationCommandHandler(ids).handle({
      type: "refresh",
      investigationId: snapshot.identity.investigationId,
      expectedRevision: snapshot.identity.revision,
      occurredAt: "2026-01-02T00:00:00.000Z",
    }, snapshot, 0);

    const refreshed = reduceInvestigationEvent(snapshot, event);

    expect(refreshed.lifecycle).toBe("refreshing");
    expect(refreshed.canonical).toEqual(snapshot.canonical);
    expect(refreshed.acceptedEvidenceIds).toEqual(snapshot.acceptedEvidenceIds);
    expect(refreshed.identity.revision).toBe(snapshot.identity.revision + 1);
  });

  it("rejects a source result from the preceding execution epoch", () => {
    const base = draftSnapshot();
    const identity = {
      ...base.identity,
      executionId: asExecutionId("old-execution"),
      correlationId: asCorrelationId("old-correlation"),
      source: "windchill",
      operation: "gather-intelligence" as const,
      attempt: 1,
    };
    const decision = assessExecutionResult(
      { ...base.identity, revision: base.identity.revision + 1, executionEpoch: base.identity.executionEpoch + 1 },
      undefined,
      identity,
    );

    expect(decision).toEqual({ accepted: false, reason: "revision-mismatch" });
  });

  it("retains failed-source canonical values as stale alongside successful refresh data", () => {
    const previous = canonical(
      [entity("windchill-1", "windchill", "Old Windchill value"), entity("sap-1", "sap", "Old SAP value")],
      [
        { source: "windchill", status: "available", entityId: "windchill-1", provenance: { provider: "test", observedAt: "2026-01-01T00:00:00.000Z", authority: "source-authoritative" } },
        { source: "sap", status: "available", entityId: "sap-1", provenance: { provider: "test", observedAt: "2026-01-01T00:00:00.000Z", authority: "source-authoritative" } },
      ],
    );
    const refreshed = canonical(
      [entity("sap-1", "sap", "New SAP value")],
      [{ source: "sap", status: "available", entityId: "sap-1", provenance: { provider: "test", observedAt: "2026-01-02T00:00:00.000Z", authority: "source-authoritative" } }],
    );

    const result = retainFailedSourceValues(previous, refreshed, new Map([["windchill", "failed"]]));

    expect(result.entities.find((item) => item.id === "windchill-1")?.temporal.freshness).toBe("stale");
    expect(result.entities.find((item) => item.id === "sap-1")?.displayName).toBe("New SAP value");
    expect(result.sources.find((source) => source.source === "windchill")?.status).toBe("failed");
    expect(result.summary.status).toBe("partial-success");
  });

  it("summarizes changed, added, and removed entity IDs", () => {
    const previous = canonical([
      entity("changed", "sap", "Before"),
      entity("removed", "windchill", "Removed"),
    ], []);
    const current = canonical([
      entity("changed", "sap", "After"),
      entity("added", "sap", "Added"),
    ], []);

    expect(summarizeEntityChanges(previous, current)).toEqual({
      changedEntityIds: ["changed"],
      addedEntityIds: ["added"],
      removedEntityIds: ["removed"],
    });
  });

  it("does not execute sources on load and refreshes using saved selections in the new epoch", async () => {
    const repository = new InMemoryInvestigationRepository();
    const eventStore = new InMemoryInvestigationEventStore();
    const kernel = new InvestigationKernel(repository, eventStore, new InvestigationCommandHandler(ids));
    const snapshot = { ...draftSnapshot(), lifecycle: "ready" as const };
    await repository.save(snapshot, snapshot.identity.revision);
    const adapter = FakeSourceExecutionAdapter.successful({ source: "refresh-test" });
    const coordinator = new SourceExecutionCoordinator(kernel, adapter, ids, { now: () => "2026-01-02T00:00:00.000Z" });

    await kernel.load(snapshot.identity.investigationId);
    expect(adapter.commands).toHaveLength(0);

    const started = await kernel.dispatch({
      type: "refresh",
      investigationId: snapshot.identity.investigationId,
      expectedRevision: snapshot.identity.revision,
      occurredAt: "2026-01-02T00:00:00.000Z",
    });
    await coordinator.run(started);

    expect(adapter.commands).toHaveLength(snapshot.selections.length * 2);
    expect(new Set(adapter.commands.map((command) => command.selection.nativeId))).toEqual(
      new Set(snapshot.selections.map((selection) => selection.nativeId)),
    );
    expect(adapter.commands.every((command) =>
      command.identity.revision === snapshot.identity.revision + 1 &&
      command.identity.executionEpoch === snapshot.identity.executionEpoch + 1,
    )).toBe(true);
  });
});