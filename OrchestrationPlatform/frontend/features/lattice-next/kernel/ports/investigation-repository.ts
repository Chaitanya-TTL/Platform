import type { InvestigationId } from "../contracts/investigation-identity";
import type { InvestigationListItem, InvestigationSnapshot } from "../contracts/investigation-snapshot";

export interface InvestigationListOptions {
  includeArchived?: boolean;
  limit?: number;
}

export interface InvestigationRepository {
  load<TCanonical = unknown>(id: InvestigationId): Promise<InvestigationSnapshot<TCanonical> | undefined>;
  save<TCanonical = unknown>(snapshot: InvestigationSnapshot<TCanonical>, expectedRevision: number): Promise<void>;
  list(options?: InvestigationListOptions): Promise<readonly InvestigationListItem[]>;
}
