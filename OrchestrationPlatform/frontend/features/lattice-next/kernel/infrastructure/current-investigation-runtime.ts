"use client";

import type { LatticeHandoff } from "../../contracts/handoff";
import { isEngineeringIntelligenceInvestigationV1, type EngineeringIntelligenceInvestigationV1 } from "../../contracts/intelligence-v1";
import type { NormalizedSearchResult } from "../../discovery/contracts";
import { CurrentCanonicalAssemblyAdapter } from "../adapters/current-canonical-assembly-adapter";
import { CurrentSourceExecutionAdapter } from "../adapters/current-source-execution-adapter";
import { CanonicalPublicationCoordinator } from "../application/canonical-publication-coordinator";
import { retainFailedSourceValues, summarizeEntityChanges } from "../application/refresh-canonical";
import { SourceExecutionCoordinator } from "../application/source-execution-coordinator";
import type { InvestigationSnapshot, InvestigationListSourceStatus } from "../contracts/investigation-snapshot";
import type { SourceExtractionStatus } from "../../contracts/intelligence-v1";
import { toInvestigationListItem } from "../application/investigation-list-item";
import { asInvestigationId } from "../contracts/investigation-identity";
import { BrowserInvestigationClock, BrowserInvestigationIdProvider } from "./browser-kernel-services";
import { HttpInvestigationAuthority } from "./http-investigation-authority";

export interface KernelInvestigationResult {
  snapshot: InvestigationSnapshot<EngineeringIntelligenceInvestigationV1>;
  canonical: EngineeringIntelligenceInvestigationV1;
  handoff: LatticeHandoff;
}

export interface InvestigationRefreshResult {
  investigationId: string;
  previousRevision: number;
  revision: number;
  lifecycle: InvestigationSnapshot["lifecycle"];
  sourceStatuses: readonly InvestigationListSourceStatus[];
  changedEntityIds: string[];
  addedEntityIds: string[];
  removedEntityIds: string[];
}

function staleSourceStatuses(snapshot: InvestigationSnapshot): ReadonlyMap<string, SourceExtractionStatus> {
  return new Map([...new Set(snapshot.selections.map((selection) => selection.source))].flatMap((source) => {
    const execution = Object.values(snapshot.executions)
      .filter((item) => item.identity.source === source && item.identity.operation === "gather-intelligence")
      .sort((left, right) => (right.completedAt ?? "").localeCompare(left.completedAt ?? ""))[0];
    if (!execution || execution.status === "succeeded") return [];
    const status: SourceExtractionStatus = execution.status === "unavailable" ? "unavailable"
      : execution?.status === "timed-out" ? "timed-out"
        : execution?.status === "cancelled" ? "cancelled"
          : execution?.status === "partial" ? "partial"
            : execution?.status === "empty" ? "not-observed"
              : "failed";
    return [[source, status] as const];
  }));
}

export function createCurrentInvestigationRuntime(handoffProvider?: (source: string) => Promise<LatticeHandoff | undefined>) {
  const ids = new BrowserInvestigationIdProvider();
  const clock = new BrowserInvestigationClock();
  const kernel = new HttpInvestigationAuthority();
  const executor = new CurrentSourceExecutionAdapter({
    getHandoff: async (command) => handoffProvider?.(command.selection.source),
  });
  const sourceCoordinator = new SourceExecutionCoordinator(kernel, executor, ids, clock);
  const assembly = new CurrentCanonicalAssemblyAdapter();
  const publication = new CanonicalPublicationCoordinator<EngineeringIntelligenceInvestigationV1>(kernel, assembly, clock);

  return {
    kernel,
    async refresh(investigationId: string, expectedRevision: number): Promise<InvestigationRefreshResult> {
      const id = asInvestigationId(investigationId);
      const previous = await kernel.load(id);
      if (!previous) throw new Error("Investigation was not found.");
      if (previous.archivedAt) throw new Error("Restore the investigation before refreshing it.");
      if (previous.identity.revision !== expectedRevision)
        throw new Error(`Investigation revision conflict: expected ${expectedRevision}, found ${previous.identity.revision}.`);

      const previousRevision = previous.identity.revision;
      const previousCanonical = isEngineeringIntelligenceInvestigationV1(previous.canonical?.value)
        ? previous.canonical.value
        : undefined;
      const started = await kernel.beginRefresh(id, expectedRevision);
      const execution = await sourceCoordinator.run(started.snapshot);
      await kernel.dispatch({ type: "request-assembly", investigationId: id, occurredAt: clock.now() });

      let refreshed = await kernel.load(id);
      if (!refreshed) throw new Error("Investigation snapshot disappeared during refresh.");
      try {
        let canonical = await assembly.assemble(refreshed, execution.evidence);
        canonical = retainFailedSourceValues(previousCanonical, canonical, staleSourceStatuses(refreshed));
        refreshed = await kernel.dispatch({
          type: "publish-canonical",
          investigationId: id,
          revision: refreshed.identity.revision,
          canonical,
          occurredAt: clock.now(),
        });
      } catch (cause) {
        refreshed = await kernel.dispatch({
          type: "fail",
          investigationId: id,
          code: "canonical-refresh-failed",
          message: cause instanceof Error ? cause.message : "Canonical refresh failed.",
          occurredAt: clock.now(),
        });
      }

      const currentCanonical = isEngineeringIntelligenceInvestigationV1(refreshed.canonical?.value)
        ? refreshed.canonical.value
        : undefined;
      return {
        investigationId,
        previousRevision,
        revision: refreshed.identity.revision,
        lifecycle: refreshed.lifecycle,
        sourceStatuses: toInvestigationListItem(refreshed).sourceStatuses,
        ...summarizeEntityChanges(previousCanonical, currentCanonical),
      };
    },
    async investigate(selected: readonly NormalizedSearchResult[], subjectLabel: string): Promise<KernelInvestigationResult> {
      let snapshot = await kernel.create(
        subjectLabel,
        subjectLabel,
        selected.map((item) => ({
          source: item.source,
          nativeId: item.nativeId,
          displayName: item.displayName,
          metadata: {
            ...Object.fromEntries(Object.entries(item.sourceMetadata).flatMap(([key, value]) => value === null ? [] : [[key, String(value)]])),
            candidateId: item.resultId,
            canonicalId: item.resultId,
            entityType: item.entityType,
            discoveryProviderMode: item.provenance.providerMode,
          },
        })),
      );
      const investigationId = snapshot.identity.investigationId;
      const execution = await sourceCoordinator.run(snapshot);
      snapshot = await publication.assembleAndPublish(execution.snapshot, execution.evidence);
      const canonical = snapshot.canonical?.value;
      if (!isEngineeringIntelligenceInvestigationV1(canonical)) {
        throw new Error(snapshot.warnings.at(-1) ?? "Investigation Kernel did not publish a valid canonical result.");
      }
      const handoff = executor.resolvedHandoff(String(investigationId), subjectLabel, snapshot.selections);
      if (!handoff) throw new Error("Investigation Kernel resolved no source structures.");
      return { snapshot: snapshot as InvestigationSnapshot<EngineeringIntelligenceInvestigationV1>, canonical, handoff };
    },
  };
}
