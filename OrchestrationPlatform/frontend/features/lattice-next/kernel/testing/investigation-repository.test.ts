import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { InvestigationCommandHandler } from "../application/investigation-command-handler";
import { InvestigationKernel } from "../application/investigation-kernel";
import { asCorrelationId, asExecutionId, asInvestigationId } from "../contracts/investigation-identity";
import { FileInvestigationRepository } from "../server/file-investigation-store";
import { InMemoryInvestigationEventStore } from "./in-memory-event-store";
import { InMemoryInvestigationRepository } from "./in-memory-investigation-repository";
import { draftSnapshot } from "./kernel-fixtures";

const temporaryRoots: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "lattice-investigations-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("investigation repository listing", () => {
  it("lists newest first and excludes archived investigations unless requested", async () => {
    const repository = new FileInvestigationRepository(await temporaryDirectory());
    const base = draftSnapshot();
    const oldest = {
      ...base,
      identity: { ...base.identity, investigationId: asInvestigationId("oldest") },
      executions: {
        "windchill:gather-intelligence:1": {
          identity: {
            ...base.identity,
            investigationId: asInvestigationId("oldest"),
            executionId: asExecutionId("execution-1"),
            correlationId: asCorrelationId("correlation-1"),
            source: "windchill",
            operation: "gather-intelligence" as const,
            attempt: 1,
          },
          status: "succeeded" as const,
          startedAt: "2025-12-31T23:59:00.000Z",
          completedAt: "2026-01-01T00:01:00.000Z",
          capturedAt: "2025-12-31T23:58:00.000Z",
          freshness: "stale" as const,
          warnings: [],
        },
      },
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const archived = { ...base, identity: { ...base.identity, investigationId: asInvestigationId("archived") }, archivedAt: "2026-01-03T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z" };
    const newest = { ...base, identity: { ...base.identity, investigationId: asInvestigationId("newest") }, updatedAt: "2026-01-02T00:00:00.000Z" };
    await repository.save(oldest, 1);
    await repository.save(archived, 1);
    await repository.save(newest, 1);

    const activeItems = await repository.list({ limit: 10 });
    expect(activeItems).toMatchObject([
      { investigationId: "newest" },
      { investigationId: "oldest" },
    ]);
    expect(activeItems[1].sourceStatuses).toContainEqual({
      source: "windchill",
      status: "succeeded",
      capturedAt: "2025-12-31T23:58:00.000Z",
      freshness: "stale",
    });
    expect(activeItems[1].capturedFreshness).toEqual({ capturedAt: "2025-12-31T23:58:00.000Z", freshness: "stale" });
    expect(activeItems[0]).not.toHaveProperty("canonical");
    await expect(repository.list({ includeArchived: true, limit: 10 })).resolves.toMatchObject([
      { investigationId: "archived", archivedAt: "2026-01-03T00:00:00.000Z" },
      { investigationId: "newest" },
      { investigationId: "oldest" },
    ]);
  });

  it("ignores malformed folders and never reads outside its configured root", async () => {
    const root = await temporaryDirectory();
    const repository = new FileInvestigationRepository(root);
    const outsideName = `${path.basename(root)}-outside`;
    const outside = path.join(path.dirname(root), outsideName);
    await mkdir(outside, { recursive: true });
    temporaryRoots.push(outside);
    await writeFile(path.join(outside, "snapshot.json"), JSON.stringify(draftSnapshot()), "utf8");
    await mkdir(path.join(root, "not a valid id"), { recursive: true });
    await mkdir(path.join(root, "valid-looking-id"), { recursive: true });
    await writeFile(path.join(root, "valid-looking-id", "snapshot.json"), "{malformed", "utf8");

    await expect(repository.load(asInvestigationId(`../${outsideName}`))).resolves.toBeUndefined();
    await expect(repository.list({ includeArchived: true, limit: 10 })).resolves.toEqual([]);
  });
});

describe("investigation archive lifecycle", () => {
  it("archives and restores without changing canonical data, events, or revision", async () => {
    const repository = new InMemoryInvestigationRepository();
    const events = new InMemoryInvestigationEventStore();
    const ids = {
      investigationId: () => asInvestigationId("generated"),
      executionId: () => asExecutionId("execution"),
      correlationId: () => asCorrelationId("correlation"),
      eventId: () => "event-id",
    };
    const kernel = new InvestigationKernel(repository, events, new InvestigationCommandHandler(ids));
    const base = draftSnapshot();
    const snapshot = {
      ...base,
      canonical: { revision: 7, publishedAt: "2026-01-01T00:00:00.000Z", value: { entityId: "entity-1" } },
    };
    await repository.save(snapshot, 1);

    const archived = await kernel.dispatch({
      type: "archive",
      investigationId: snapshot.identity.investigationId,
      occurredAt: "2026-01-02T00:00:00.000Z",
    });
    expect(archived.archivedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(archived.identity.revision).toBe(snapshot.identity.revision);
    expect(archived.canonical).toEqual(snapshot.canonical);

    const restored = await kernel.dispatch({
      type: "restore",
      investigationId: snapshot.identity.investigationId,
      occurredAt: "2026-01-03T00:00:00.000Z",
    });
    expect(restored.archivedAt).toBeUndefined();
    expect(restored.identity.revision).toBe(snapshot.identity.revision);
    expect(restored.canonical).toEqual(snapshot.canonical);
    await expect(events.read(snapshot.identity.investigationId)).resolves.toMatchObject([
      { type: "investigation-archived", investigationId: snapshot.identity.investigationId },
      { type: "investigation-restored", investigationId: snapshot.identity.investigationId },
    ]);
  });
});