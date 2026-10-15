import type { LatticeHandoff, LatticeSourceEnvelope } from "../../contracts/handoff";
import {
  isEngineeringIntelligenceInvestigationV1,
  type EngineeringIntelligenceInvestigationV1,
} from "../../contracts/intelligence-v1";
import type { ResolvedStructure } from "../../discovery/structure-resolver";
import { legacyHandoffToIntelligence } from "../../engines/legacy-handoff-to-intelligence";
import { projectCodebeamerIntelligence } from "../../engines/project-codebeamer-intelligence";
import { mergeSourceIntelligence } from "../../infrastructure/merge-source-intelligence";
import type { EvidenceEnvelope } from "../contracts/evidence-envelope";
import type { InvestigationSnapshot } from "../contracts/investigation-snapshot";
import type { CanonicalAssemblyPort } from "../ports/canonical-assembly-port";

function isResolvedStructure(value: unknown): value is ResolvedStructure {
  return value !== null && typeof value === "object" && "root" in value && "state" in value;
}

function structureHandoff(
  snapshot: InvestigationSnapshot,
  evidence: readonly EvidenceEnvelope[],
): LatticeHandoff | undefined {
  const sources: LatticeSourceEnvelope[] = [];
  for (const envelope of evidence) {
    if (envelope.identity.operation !== "resolve-structure" || !isResolvedStructure(envelope.payload)) continue;
    const selection = snapshot.selections.find((item) => item.source === envelope.identity.source);
    if (!selection) continue;
    const payload = envelope.payload;
    sources.push({
      source: selection.source as LatticeSourceEnvelope["source"],
      label: selection.source,
      root: payload.root,
      nativeId: selection.nativeId,
      jobId: payload.jobId,
      capturedAt: envelope.observedAt,
      completeness: payload.state === "ready" ? "complete" : "partial",
      intelligencePayload: payload.intelligencePayload,
    });
  }
  if (!sources.length) return undefined;
  return {
    version: 2,
    handoffId: String(snapshot.identity.investigationId),
    createdAt: snapshot.createdAt,
    expiresAt: new Date(Date.parse(snapshot.createdAt) + 24 * 60 * 60 * 1000).toISOString(),
    subjectLabel: snapshot.subjectLabel,
    sources,
  };
}

export class CurrentCanonicalAssemblyAdapter
  implements CanonicalAssemblyPort<EngineeringIntelligenceInvestigationV1>
{
  async assemble(
    snapshot: InvestigationSnapshot,
    evidence: readonly EvidenceEnvelope[],
  ): Promise<EngineeringIntelligenceInvestigationV1> {
    const intelligence = evidence
      .filter((item) => item.validation.status === "accepted")
      .map((item) => item.payload)
      .filter(isEngineeringIntelligenceInvestigationV1)
      .sort((left, right) => {
        const leftSource = left.sources[0]?.source ?? "";
        const rightSource = right.sources[0]?.source ?? "";
        return leftSource.localeCompare(rightSource) || left.investigationId.localeCompare(right.investigationId);
      });
    const codebeamer = evidence
      .filter((item) => item.validation.status === "accepted" && item.identity.source === "codebeamer" && item.identity.operation === "resolve-structure")
      .map((item) => projectCodebeamerIntelligence(String(snapshot.identity.investigationId), item.payload, item.observedAt))
      .filter((item): item is EngineeringIntelligenceInvestigationV1 => Boolean(item));
    const native = [...intelligence, ...codebeamer];
    if (native.length) return native.length === 1 ? native[0] : mergeSourceIntelligence(native);
    const handoff = structureHandoff(snapshot, evidence);
    if (handoff) return legacyHandoffToIntelligence(handoff);
    throw new Error("No accepted evidence is available for current canonical assembly.");
  }
}
