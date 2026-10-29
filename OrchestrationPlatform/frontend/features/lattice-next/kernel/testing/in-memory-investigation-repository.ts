import type { InvestigationId } from "../contracts/investigation-identity";
import type { InvestigationListItem, InvestigationSnapshot } from "../contracts/investigation-snapshot";
import type { InvestigationListOptions, InvestigationRepository } from "../ports/investigation-repository";
import { toInvestigationListItem } from "../application/investigation-list-item";

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

  async list(options: InvestigationListOptions = {}): Promise<readonly InvestigationListItem[]> {
    const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 20)));
    return [...this.values.values()]
      .filter((snapshot) => options.includeArchived || !snapshot.archivedAt)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit)
      .map(toInvestigationListItem);
  }
}
