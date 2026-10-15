"use client";

import type { LatticeHandoff } from "../../contracts/handoff";
import { isEngineeringIntelligenceInvestigationV1, type EngineeringIntelligenceInvestigationV1 } from "../../contracts/intelligence-v1";
import type { NormalizedSearchResult } from "../../discovery/contracts";
import { CurrentCanonicalAssemblyAdapter } from "../adapters/current-canonical-assembly-adapter";
import { CurrentSourceExecutionAdapter } from "../adapters/current-source-execution-adapter";
import { CanonicalPublicationCoordinator } from "../application/canonical-publication-coordinator";
import { SourceExecutionCoordinator } from "../application/source-execution-coordinator";
import type { InvestigationSnapshot } from "../contracts/investigation-snapshot";
import { BrowserInvestigationClock, BrowserInvestigationIdProvider } from "./browser-kernel-services";
import { HttpInvestigationAuthority } from "./http-investigation-authority";

export interface KernelInvestigationResult {
  snapshot: InvestigationSnapshot<EngineeringIntelligenceInvestigationV1>;
  canonical: EngineeringIntelligenceInvestigationV1;
  handoff: LatticeHandoff;
}

export function createCurrentInvestigationRuntime(handoffProvider?: (source: string) => Promise<LatticeHandoff | undefined>) {
  const ids = new BrowserInvestigationIdProvider();
  const clock = new BrowserInvestigationClock();
  const kernel = new HttpInvestigationAuthority();
  const executor = new CurrentSourceExecutionAdapter({
    getHandoff: async (command) => handoffProvider?.(command.selection.source),
  });
  const sourceCoordinator = new SourceExecutionCoordinator(kernel, executor, ids, clock);
  const publication = new CanonicalPublicationCoordinator<EngineeringIntelligenceInvestigationV1>(kernel, new CurrentCanonicalAssemblyAdapter(), clock);

  return {
    kernel,
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
