import type { InvestigationCommand } from "../contracts/investigation-command";
import type { InvestigationId } from "../contracts/investigation-identity";
import type { InvestigationSnapshot } from "../contracts/investigation-snapshot";
import type { InvestigationEventStore } from "../ports/investigation-event-store";
import type { InvestigationListItem } from "../contracts/investigation-snapshot";
import type { InvestigationListOptions, InvestigationRepository } from "../ports/investigation-repository";
import { reduceInvestigationEvent } from "./investigation-event-reducer";
import { InvestigationCommandHandler } from "./investigation-command-handler";

export type InvestigationSubscriber = (snapshot: InvestigationSnapshot) => void;

export class InvestigationKernel {
  private readonly subscribers = new Map<InvestigationId, Set<InvestigationSubscriber>>();
  private readonly queues = new Map<InvestigationId, Promise<void>>();

  constructor(
    private readonly repository: InvestigationRepository,
    private readonly events: InvestigationEventStore,
    private readonly commands: InvestigationCommandHandler,
  ) {}

  dispatch(command: InvestigationCommand): Promise<InvestigationSnapshot> {
    const id = this.commandInvestigationId(command);
    const prior = this.queues.get(id) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const queued = prior.then(() => gate);
    this.queues.set(id, queued);
    return prior
      .then(() => this.dispatchSerial(id, command))
      .finally(() => {
        release();
        if (this.queues.get(id) === queued) this.queues.delete(id);
      });
  }

  load(id: InvestigationId): Promise<InvestigationSnapshot | undefined> {
    return this.repository.load(id);
  }

  list(options?: InvestigationListOptions): Promise<readonly InvestigationListItem[]> {
    return this.repository.list(options);
  }

  subscribe(id: InvestigationId, subscriber: InvestigationSubscriber): () => void {
    const set = this.subscribers.get(id) ?? new Set<InvestigationSubscriber>();
    set.add(subscriber);
    this.subscribers.set(id, set);
    return () => {
      set.delete(subscriber);
      if (!set.size) this.subscribers.delete(id);
    };
  }

  private async dispatchSerial(
    id: InvestigationId,
    command: InvestigationCommand,
  ): Promise<InvestigationSnapshot> {
    const [snapshot, stream] = await Promise.all([
      this.repository.load(id),
      this.events.read(id),
    ]);
    const produced = this.commands.handle(command, snapshot, stream.length);
    let next = snapshot;
    for (const event of produced) next = reduceInvestigationEvent(next, event);
    if (!next) throw new Error("Command did not produce an investigation snapshot.");
    await this.events.append(id, produced, stream.length);
    await this.repository.save(next, snapshot?.identity.revision ?? next.identity.revision);
    this.publish(next);
    return next;
  }

  private commandInvestigationId(command: InvestigationCommand): InvestigationId {
    return command.type === "source-requested" || command.type === "source-started"
      ? command.identity.investigationId
      : command.type === "source-completed"
        ? command.result.identity.investigationId
        : command.investigationId;
  }

  private publish(snapshot: InvestigationSnapshot): void {
    for (const subscriber of this.subscribers.get(snapshot.identity.investigationId) ?? [])
      subscriber(snapshot);
  }
}
