import type { SourceOperationCommand } from "../contracts/source-operation";
import type { SourceOperationResult } from "../contracts/source-operation-result";

export interface SourceExecutionPort {
  execute(command: SourceOperationCommand): Promise<SourceOperationResult>;
}
