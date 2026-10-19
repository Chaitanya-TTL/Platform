import type { EvidenceEnvelope as LegacyEvidenceEnvelope } from "../contracts/evidence-envelope";
import type { EvidenceCandidate, EvidenceCompleteness, EvidenceFreshness } from "./evidence-contracts";

const completenessOf = (value: LegacyEvidenceEnvelope): EvidenceCompleteness => {
  if (value.authority === "unavailable") return "unavailable";
  if (value.warnings.length) return "partial";
  return "complete";
};
const freshnessOf = (value: LegacyEvidenceEnvelope): EvidenceFreshness => value.freshness;

export function legacyEvidenceToCandidate<TPayload>(value: LegacyEvidenceEnvelope<TPayload>, receivedAt = new Date().toISOString()): EvidenceCandidate<TPayload> {
  return {
    identity: value.identity,
    schema: { name: value.identity.operation, version: value.validation.schemaVersion },
    authority: value.authority,
    freshness: freshnessOf(value),
    completeness: completenessOf(value),
    capturedAt: value.observedAt,
    receivedAt,
    provenance: {
      provider: "current-evidence-compatibility-adapter",
      sourceRecord: { source: value.identity.source, nativeId: `${value.identity.source}:${value.identity.operation}` },
      observedAt: value.observedAt,
    },
    payload: value.payload,
    warnings: value.warnings,
  };
}
