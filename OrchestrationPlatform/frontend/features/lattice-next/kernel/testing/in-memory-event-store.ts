import type { InvestigationEvent } from "../contracts/investigation-event";
import type { InvestigationId } from "../contracts/investigation-identity";
import type { InvestigationEventStore } from "../ports/investigation-event-store";

export class InMemoryInvestigationEventStore implements InvestigationEventStore {
  private readonly streams = new Map<InvestigationId, InvestigationEvent[]>();

  async append(id: InvestigationId, events: readonly InvestigationEvent[], expectedSequence: number): Promise<void> {
    const current = this.streams.get(id) ?? [];
    if (current.length !== expectedSequence)
      throw new Error(`Event sequence conflict: expected ${expectedSequence}, found ${current.length}.`);
    this.streams.set(id, [...current, ...events]);
  }

  async read(id: InvestigationId): Promise<readonly InvestigationEvent[]> {
    return [...(this.streams.get(id) ?? [])];
  }
}
