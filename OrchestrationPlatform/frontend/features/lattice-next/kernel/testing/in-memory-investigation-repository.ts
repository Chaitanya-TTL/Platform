import type { InvestigationId } from "../contracts/investigation-identity";
import type { InvestigationSnapshot } from "../contracts/investigation-snapshot";
import type { InvestigationRepository } from "../ports/investigation-repository";

export class InMemoryInvestigationRepository implements InvestigationRepository {
  private readonly values = new Map<InvestigationId, InvestigationSnapshot>();

  async load<TCanonical = unknown>(id: InvestigationId): Promise<InvestigationSnapshot<TCanonical> | undefined> {
    return this.values.get(id) as InvestigationSnapshot<TCanonical> | undefined;
  }

  async save<TCanonical = unknown>(snapshot: InvestigationSnapshot<TCanonical>, expectedRevision: number): Promise<void> {
    const current = this.values.get(snapshot.identity.investigationId);
    if (current && current.identity.revision !== expectedRevision)
      throw new Error(`Investigation revision conflict: expected ${expectedRevision}, found ${current.identity.revision}.`);
    this.values.set(snapshot.identity.investigationId, snapshot as InvestigationSnapshot);
  }
}
