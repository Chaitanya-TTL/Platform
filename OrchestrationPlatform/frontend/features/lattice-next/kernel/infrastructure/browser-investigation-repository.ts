"use client";

import type { InvestigationId } from "../contracts/investigation-identity";
import type { InvestigationListItem, InvestigationSnapshot } from "../contracts/investigation-snapshot";
import { toInvestigationListItem } from "../application/investigation-list-item";
import type { InvestigationListOptions, InvestigationRepository } from "../ports/investigation-repository";

const PREFIX = "lattice-kernel:snapshot:";

export class BrowserInvestigationRepository implements InvestigationRepository {
  async load<TCanonical = unknown>(id: InvestigationId): Promise<InvestigationSnapshot<TCanonical> | undefined> {
    try {
      const raw = localStorage.getItem(`${PREFIX}${id}`);
      return raw ? JSON.parse(raw) as InvestigationSnapshot<TCanonical> : undefined;
    } catch {
      return undefined;
    }
  }

  async save<TCanonical = unknown>(snapshot: InvestigationSnapshot<TCanonical>, expectedRevision: number): Promise<void> {
    const current = await this.load(snapshot.identity.investigationId);
    if (current && current.identity.revision !== expectedRevision) {
      throw new Error(`Investigation revision conflict: expected ${expectedRevision}, found ${current.identity.revision}.`);
    }
    localStorage.setItem(`${PREFIX}${snapshot.identity.investigationId}`, JSON.stringify(snapshot));
  }

  async list(options: InvestigationListOptions = {}): Promise<readonly InvestigationListItem[]> {
    const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(100, Math.floor(options.limit!))) : 20;
    const snapshots: InvestigationSnapshot[] = [];
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key?.startsWith(PREFIX)) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const snapshot = JSON.parse(raw) as InvestigationSnapshot;
        if (!options.includeArchived && snapshot.archivedAt) continue;
        snapshots.push(snapshot);
      }
    } catch {
      return [];
    }
    return snapshots
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit)
      .map(toInvestigationListItem);
  }
}
