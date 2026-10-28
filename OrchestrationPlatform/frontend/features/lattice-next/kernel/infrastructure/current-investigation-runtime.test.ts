import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineeringIntelligenceInvestigationV1, IntelligenceEntity } from "../../contracts/intelligence-v1";
import type { InvestigationSnapshot } from "../contracts/investigation-snapshot";
import { asInvestigationId } from "../contracts/investigation-identity";

const mocks = vi.hoisted(() => ({
  kernel: { load: vi.fn(), beginRefresh: vi.fn(), dispatch: vi.fn(), create: vi.fn() },
  sourceRun: vi.fn(),
  assemble: vi.fn(),
}));

vi.mock("./http-investigation-authority", () => ({
  HttpInvestigationAuthority: class { constructor() { return mocks.kernel; } },
}));
vi.mock("../adapters/current-source-execution-adapter", () => ({
  CurrentSourceExecutionAdapter: class { resolvedHandoff = vi.fn(); },
}));
vi.mock("../application/source-execution-coordinator", () => ({
  SourceExecutionCoordinator: class { run(snapshot: InvestigationSnapshot) { return mocks.sourceRun(snapshot); } },
}));
vi.mock("../adapters/current-canonical-assembly-adapter", () => ({
  CurrentCanonicalAssemblyAdapter: class { assemble(snapshot: InvestigationSnapshot, evidence: unknown[]) { return mocks.assemble(snapshot, evidence); } },
}));

import { createCurrentInvestigationRuntime } from "./current-investigation-runtime";

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
    investigationId: "investigation-refresh",
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

function source(source: "windchill" | "sap", status: "available" | "failed", entityId: string) {
  return { source, status, entityId, provenance: { provider: "test", observedAt: "2026-01-01T00:00:00.000Z", authority: "source-authoritative" as const } };
}

describe("current investigation runtime refresh", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refreshes persisted selections, retains failed-source values, and returns entity deltas", async () => {
    const investigationId = asInvestigationId("investigation-refresh");
    const previousCanonical = canonical([
      entity("windchill-1", "windchill", "Last known Windchill"),
      entity("sap-1", "sap", "Old SAP value"),
      entity("removed-1", "sap", "Removed value"),
    ], [source("windchill", "available", "windchill-1"), source("sap", "available", "sap-1")]);
    const freshCanonical = canonical([
      entity("sap-1", "sap", "Updated SAP value"),
      entity("added-1", "sap", "Added value"),
    ], [source("sap", "available", "sap-1")]);
    const previous = {
      identity: { investigationId, revision: 4, executionEpoch: 2 },
      lifecycle: "ready",
      subjectLabel: "Assembly",
      query: "Assembly",
      selections: [
        { source: "windchill", nativeId: "wc-saved", displayName: "Saved Windchill" },
        { source: "sap", nativeId: "sap-saved", displayName: "Saved SAP" },
      ],
      executions: {},
      acceptedEvidenceIds: ["evidence:previous"],
      completeness: { overall: "complete", requestedSources: ["windchill", "sap"], successfulSources: ["windchill", "sap"], partialSources: [], failedSources: [], pendingSources: [], limitations: [] },
      canonical: { revision: 4, publishedAt: "2026-01-01T00:00:00.000Z", value: previousCanonical },
      warnings: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as InvestigationSnapshot<EngineeringIntelligenceInvestigationV1>;
    const started = { ...previous, identity: { ...previous.identity, revision: 5, executionEpoch: 3 }, lifecycle: "refreshing" as const };
    const assembling = {
      ...started,
      lifecycle: "assembling" as const,
      executions: {
        windchill: { identity: { ...started.identity, executionId: "windchill-exec", correlationId: "windchill-correlation", source: "windchill", operation: "gather-intelligence" as const, attempt: 1 }, status: "failed" as const, completedAt: "2026-01-02T00:00:00.000Z", warnings: [] },
        sap: { identity: { ...started.identity, executionId: "sap-exec", correlationId: "sap-correlation", source: "sap", operation: "gather-intelligence" as const, attempt: 1 }, status: "succeeded" as const, completedAt: "2026-01-02T00:00:01.000Z", warnings: [] },
      },
      completeness: { ...previous.completeness, overall: "partial" as const, successfulSources: ["sap"], failedSources: ["windchill"] },
    };
    mocks.kernel.load.mockResolvedValueOnce(previous).mockResolvedValueOnce(assembling);
    mocks.kernel.beginRefresh.mockResolvedValue({ snapshot: started, previousRevision: 4, revision: 5, lifecycle: "refreshing", sourceStatuses: [] });
    mocks.sourceRun.mockResolvedValue({ snapshot: started, evidence: [] });
    mocks.assemble.mockResolvedValue(freshCanonical);
    mocks.kernel.dispatch.mockImplementation(async (command: { type: string; canonical?: EngineeringIntelligenceInvestigationV1 }) =>
      command.type === "publish-canonical"
        ? { ...assembling, lifecycle: "partial", canonical: { revision: 5, publishedAt: "2026-01-02T00:00:02.000Z", value: command.canonical } }
        : assembling,
    );

    const runtime = createCurrentInvestigationRuntime();
    const result = await runtime.refresh(String(investigationId), 4);

    expect(mocks.kernel.beginRefresh).toHaveBeenCalledWith(investigationId, 4);
    expect(mocks.sourceRun).toHaveBeenCalledWith(started);
    expect(result).toMatchObject({
      previousRevision: 4,
      revision: 5,
      lifecycle: "partial",
      changedEntityIds: ["sap-1", "windchill-1"],
      addedEntityIds: ["added-1"],
      removedEntityIds: ["removed-1"],
    });
    const published = mocks.kernel.dispatch.mock.calls.find(([command]) => command.type === "publish-canonical")?.[0].canonical;
    expect(published?.entities.find((item: IntelligenceEntity) => item.id === "windchill-1")?.temporal.freshness).toBe("stale");
    expect(published?.sources.find((item: EngineeringIntelligenceInvestigationV1["sources"][number]) => item.source === "windchill")?.status).toBe("failed");
  });

  it("leaves the previous canonical value intact when refreshed evidence cannot assemble", async () => {
    const investigationId = asInvestigationId("investigation-refresh");
    const previousCanonical = canonical([entity("windchill-1", "windchill", "Last known")], [source("windchill", "available", "windchill-1")]);
    const previous = {
      identity: { investigationId, revision: 4, executionEpoch: 2 },
      lifecycle: "ready",
      subjectLabel: "Assembly",
      query: "Assembly",
      selections: [{ source: "windchill", nativeId: "wc-saved", displayName: "Saved Windchill" }],
      executions: {},
      acceptedEvidenceIds: [],
      completeness: { overall: "complete", requestedSources: ["windchill"], successfulSources: ["windchill"], partialSources: [], failedSources: [], pendingSources: [], limitations: [] },
      canonical: { revision: 4, publishedAt: "2026-01-01T00:00:00.000Z", value: previousCanonical },
      warnings: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as InvestigationSnapshot<EngineeringIntelligenceInvestigationV1>;
    const started = { ...previous, identity: { ...previous.identity, revision: 5, executionEpoch: 3 }, lifecycle: "refreshing" as const };
    const assembling = { ...started, lifecycle: "assembling" as const, executions: {}, completeness: previous.completeness };
    mocks.kernel.load.mockResolvedValueOnce(previous).mockResolvedValueOnce(assembling);
    mocks.kernel.beginRefresh.mockResolvedValue({ snapshot: started, previousRevision: 4, revision: 5, lifecycle: "refreshing", sourceStatuses: [] });
    mocks.sourceRun.mockResolvedValue({ snapshot: started, evidence: [] });
    mocks.assemble.mockRejectedValue(new Error("No accepted refreshed evidence."));
    mocks.kernel.dispatch.mockResolvedValue({ ...assembling, lifecycle: "failed", canonical: previous.canonical });

    const runtime = createCurrentInvestigationRuntime();
    const result = await runtime.refresh(String(investigationId), 4);

    expect(result.lifecycle).toBe("failed");
    expect(result.revision).toBe(5);
    expect(result.changedEntityIds).toEqual([]);
    expect(result.addedEntityIds).toEqual([]);
    expect(result.removedEntityIds).toEqual([]);
    expect(mocks.kernel.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "fail", code: "canonical-refresh-failed" }));
  });
});