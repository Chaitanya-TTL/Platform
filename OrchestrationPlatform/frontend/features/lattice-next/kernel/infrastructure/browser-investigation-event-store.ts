"use client";

import type { InvestigationEvent } from "../contracts/investigation-event";
import type { InvestigationId } from "../contracts/investigation-identity";
import type { InvestigationEventStore } from "../ports/investigation-event-store";

const PREFIX = "lattice-kernel:events:";

export class BrowserInvestigationEventStore implements InvestigationEventStore {
  async append(id: InvestigationId, events: readonly InvestigationEvent[], expectedSequence: number): Promise<void> {
    const current = await this.read(id);
    if (current.length !== expectedSequence) {
      throw new Error(`Event sequence conflict: expected ${expectedSequence}, found ${current.length}.`);
    }
    localStorage.setItem(`${PREFIX}${id}`, JSON.stringify([...current, ...events]));
  }

  async read(id: InvestigationId): Promise<readonly InvestigationEvent[]> {
    try {
      const raw = localStorage.getItem(`${PREFIX}${id}`);
      return raw ? JSON.parse(raw) as InvestigationEvent[] : [];
    } catch {
      return [];
    }
  }
}
