import type { EvidenceEnvelope } from "../contracts/evidence-envelope";
import type { InvestigationSnapshot } from "../contracts/investigation-snapshot";
import type { CanonicalAssemblyPort } from "../ports/canonical-assembly-port";

export class FakeCanonicalAssemblyAdapter<TCanonical = unknown>
  implements CanonicalAssemblyPort<TCanonical>
{
  readonly calls: Array<{ snapshot: InvestigationSnapshot; evidence: readonly EvidenceEnvelope[] }> = [];
  constructor(private readonly value: TCanonical) {}
  async assemble(snapshot: InvestigationSnapshot, evidence: readonly EvidenceEnvelope[]): Promise<TCanonical> {
    this.calls.push({ snapshot, evidence });
    return this.value;
  }
}
