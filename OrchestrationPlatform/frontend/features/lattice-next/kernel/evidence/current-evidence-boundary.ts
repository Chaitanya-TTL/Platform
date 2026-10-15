import type { EvidenceEnvelope as LegacyEvidenceEnvelope } from "../contracts/evidence-envelope";
import { EvidenceAcceptanceService } from "./evidence-acceptance-service";
import { BasicEvidenceValidator } from "./default-evidence-validator";
import type { EvidenceDecision } from "./evidence-contracts";
import { EvidenceValidationRegistry } from "./evidence-validator";
import { legacyEvidenceToCandidate } from "./current-evidence-compatibility";

export async function validateCurrentEvidence<TPayload>(legacy: LegacyEvidenceEnvelope<TPayload>, receivedAt = new Date().toISOString()): Promise<EvidenceDecision<TPayload>> {
  const candidate = legacyEvidenceToCandidate(legacy, receivedAt);
  const registry = new EvidenceValidationRegistry();
  registry.register(new BasicEvidenceValidator(candidate.schema));
  return new EvidenceAcceptanceService(registry, () => receivedAt).evaluate<TPayload>(candidate);
}
