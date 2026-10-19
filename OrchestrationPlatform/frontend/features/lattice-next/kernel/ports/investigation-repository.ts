import type { InvestigationId } from "../contracts/investigation-identity";
import type { InvestigationSnapshot } from "../contracts/investigation-snapshot";

export interface InvestigationRepository {
  load<TCanonical = unknown>(id: InvestigationId): Promise<InvestigationSnapshot<TCanonical> | undefined>;
  save<TCanonical = unknown>(snapshot: InvestigationSnapshot<TCanonical>, expectedRevision: number): Promise<void>;
}
