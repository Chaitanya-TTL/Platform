"use client";

import type { InvestigationId } from "../contracts/investigation-identity";
import type { InvestigationSnapshot } from "../contracts/investigation-snapshot";
import type { InvestigationRepository } from "../ports/investigation-repository";

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
}
