import type { EvidenceEnvelope } from "../contracts/evidence-envelope";
import type { ExecutionIdentity, SourceOperationKind } from "../contracts/investigation-identity";
import type { InvestigationSnapshot } from "../contracts/investigation-snapshot";
import type { SourceOperationCommand, SourceSelection } from "../contracts/source-operation";
import type { InvestigationIdProvider, InvestigationClock } from "../ports/kernel-services";
import type { SourceExecutionPort } from "../ports/source-execution-port";
import type { InvestigationAuthorityPort } from "../ports/investigation-authority-port";

export interface CoordinatedExecution {
  evidence: readonly EvidenceEnvelope[];
  snapshot: InvestigationSnapshot;
}

export class SourceExecutionCoordinator {
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    private readonly kernel: InvestigationAuthorityPort,
    private readonly executor: SourceExecutionPort,
    private readonly ids: InvestigationIdProvider,
    private readonly clock: InvestigationClock,
  ) {}

  async run(snapshot: InvestigationSnapshot): Promise<CoordinatedExecution> {
    await this.kernel.dispatch({
      type: "begin",
      investigationId: snapshot.identity.investigationId,
      occurredAt: this.clock.now(),
    });
    const resolveSelection = (selection: SourceSelection) => this.runOperation(snapshot, selection, "resolve-structure");
    const codebeamer = snapshot.selections.filter((selection) => selection.source === "codebeamer");
    const others = snapshot.selections.filter((selection) => selection.source !== "codebeamer");
    const boundedCodebeamer = await this.runBounded(codebeamer, 3, resolveSelection);
    const structures = [...await Promise.all(others.map(resolveSelection)), ...boundedCodebeamer];
    const intelligence = await Promise.all(snapshot.selections.map((selection) =>
      this.runOperation(snapshot, selection, "gather-intelligence"),
    ));
    const latest = await this.kernel.load(snapshot.identity.investigationId);
    if (!latest) throw new Error("Investigation snapshot disappeared during execution.");
    return {
      evidence: [...structures, ...intelligence].flatMap((result) => result ? [result] : []),
      snapshot: latest,
    };
  }

  private async runBounded<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length); let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (cursor < items.length) { const index = cursor++; results[index] = await worker(items[index]); } }));
    return results;
  }

  cancel(snapshot: InvestigationSnapshot): void {
    for (const [key, controller] of this.controllers) {
      if (key.startsWith(`${snapshot.identity.investigationId}:`)) controller.abort("investigation-cancelled");
    }
  }

  private async runOperation(
    snapshot: InvestigationSnapshot,
    selection: SourceSelection,
    operation: SourceOperationKind,
  ): Promise<EvidenceEnvelope | undefined> {
    const identity: ExecutionIdentity = {
      ...snapshot.identity,
      executionId: this.ids.executionId(),
      correlationId: this.ids.correlationId(),
      source: selection.source,
      operation,
      attempt: 1,
    };
    const key = `${snapshot.identity.investigationId}:${identity.executionId}`;
    const controller = new AbortController();
    this.controllers.set(key, controller);
    const command: SourceOperationCommand = { identity, selection, signal: controller.signal };
    await this.kernel.dispatch({ type: "source-requested", identity, occurredAt: this.clock.now() });
    await this.kernel.dispatch({ type: "source-started", identity, occurredAt: this.clock.now() });
    try {
      const result = await this.executor.execute(command);
      await this.kernel.dispatch({ type: "source-completed", result, occurredAt: this.clock.now() });
      return result.evidence?.validation.status === "accepted" ? result.evidence : undefined;
    } finally {
      this.controllers.delete(key);
    }
  }
}
