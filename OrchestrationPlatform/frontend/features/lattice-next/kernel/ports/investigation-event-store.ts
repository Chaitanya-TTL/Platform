import type { InvestigationEvent } from "../contracts/investigation-event";
import type { InvestigationId } from "../contracts/investigation-identity";

export interface InvestigationEventStore {
  append(id: InvestigationId, events: readonly InvestigationEvent[], expectedSequence: number): Promise<void>;
  read(id: InvestigationId): Promise<readonly InvestigationEvent[]>;
}
