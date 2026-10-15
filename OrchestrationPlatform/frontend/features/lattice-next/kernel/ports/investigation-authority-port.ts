import type { InvestigationCommand } from "../contracts/investigation-command";
import type { InvestigationId } from "../contracts/investigation-identity";
import type { InvestigationSnapshot } from "../contracts/investigation-snapshot";

export interface InvestigationAuthorityPort {
  dispatch(command: InvestigationCommand): Promise<InvestigationSnapshot>;
  load(id: InvestigationId): Promise<InvestigationSnapshot | undefined>;
}
