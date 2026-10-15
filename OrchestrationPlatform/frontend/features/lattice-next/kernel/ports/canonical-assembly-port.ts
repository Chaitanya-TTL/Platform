import type { EvidenceEnvelope } from "../contracts/evidence-envelope";
import type { InvestigationSnapshot } from "../contracts/investigation-snapshot";

export interface CanonicalAssemblyPort<TCanonical = unknown> {
  assemble(snapshot: InvestigationSnapshot, evidence: readonly EvidenceEnvelope[]): Promise<TCanonical>;
}
