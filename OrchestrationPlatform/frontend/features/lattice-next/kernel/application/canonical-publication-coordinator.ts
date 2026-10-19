import type { EvidenceEnvelope } from "../contracts/evidence-envelope";
import type { InvestigationSnapshot } from "../contracts/investigation-snapshot";
import type { CanonicalAssemblyPort } from "../ports/canonical-assembly-port";
import type { InvestigationClock } from "../ports/kernel-services";
import type { InvestigationAuthorityPort } from "../ports/investigation-authority-port";

export class CanonicalPublicationCoordinator<TCanonical = unknown> {
  constructor(
    private readonly kernel: InvestigationAuthorityPort,
    private readonly assembly: CanonicalAssemblyPort<TCanonical>,
    private readonly clock: InvestigationClock,
  ) {}

  async assembleAndPublish(
    snapshot: InvestigationSnapshot,
    evidence: readonly EvidenceEnvelope[],
  ): Promise<InvestigationSnapshot> {
    await this.kernel.dispatch({
      type: "request-assembly",
      investigationId: snapshot.identity.investigationId,
      occurredAt: this.clock.now(),
    });
    try {
      const current = await this.kernel.load(snapshot.identity.investigationId);
      if (!current) throw new Error("Investigation snapshot is unavailable for canonical assembly.");
      const canonical = await this.assembly.assemble(current, evidence);
      return await this.kernel.dispatch({
        type: "publish-canonical",
        investigationId: current.identity.investigationId,
        revision: current.identity.revision,
        canonical,
        occurredAt: this.clock.now(),
      });
    } catch (cause) {
      return await this.kernel.dispatch({
        type: "fail",
        investigationId: snapshot.identity.investigationId,
        code: "canonical-assembly-failed",
        message: cause instanceof Error ? cause.message : "Canonical assembly failed.",
        occurredAt: this.clock.now(),
      });
    }
  }
}
