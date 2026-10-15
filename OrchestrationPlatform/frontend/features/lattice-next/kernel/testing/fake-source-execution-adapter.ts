import type { EvidenceEnvelope } from "../contracts/evidence-envelope";
import type { SourceOperationCommand } from "../contracts/source-operation";
import type { SourceOperationResult } from "../contracts/source-operation-result";
import type { SourceExecutionPort } from "../ports/source-execution-port";

export type FakeSourceBehavior = (
  command: SourceOperationCommand,
) => Promise<SourceOperationResult>;

export class FakeSourceExecutionAdapter implements SourceExecutionPort {
  readonly commands: SourceOperationCommand[] = [];
  constructor(private readonly behavior: FakeSourceBehavior) {}
  async execute(command: SourceOperationCommand): Promise<SourceOperationResult> {
    this.commands.push(command);
    return this.behavior(command);
  }

  static successful(payload: unknown = {}): FakeSourceExecutionAdapter {
    return new FakeSourceExecutionAdapter(async (command) => {
      const now = new Date().toISOString();
      const evidence: EvidenceEnvelope = {
        envelopeVersion: "1.0",
        identity: command.identity,
        authority: "source-authoritative",
        observedAt: now,
        freshness: "current",
        validation: { status: "accepted", schemaVersion: "fake-v1", issues: [] },
        warnings: [],
        payload,
      };
      return {
        identity: command.identity,
        status: "succeeded",
        startedAt: now,
        completedAt: now,
        durationMs: 0,
        evidence,
        warnings: [],
      };
    });
  }
}
