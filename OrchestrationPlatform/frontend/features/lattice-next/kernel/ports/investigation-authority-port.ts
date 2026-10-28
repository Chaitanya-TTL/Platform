import type { InvestigationCommand } from "../contracts/investigation-command";
import type { InvestigationId } from "../contracts/investigation-identity";
import type { InvestigationListItem, InvestigationSnapshot } from "../contracts/investigation-snapshot";
import type { InvestigationListOptions } from "./investigation-repository";

export interface InvestigationRefreshStarted {
  snapshot: InvestigationSnapshot;
  previousRevision: number;
  revision: number;
  lifecycle: InvestigationSnapshot["lifecycle"];
  sourceStatuses: InvestigationListItem["sourceStatuses"];
}

export interface InvestigationAuthorityPort {
  dispatch(command: InvestigationCommand): Promise<InvestigationSnapshot>;
  load(id: InvestigationId): Promise<InvestigationSnapshot | undefined>;
}

export interface InvestigationManagementAuthorityPort extends InvestigationAuthorityPort {
  list(options?: InvestigationListOptions): Promise<readonly InvestigationListItem[]>;
  archive(id: InvestigationId): Promise<InvestigationSnapshot>;
  restore(id: InvestigationId): Promise<InvestigationSnapshot>;
  beginRefresh(id: InvestigationId, expectedRevision: number): Promise<InvestigationRefreshStarted>;
}
