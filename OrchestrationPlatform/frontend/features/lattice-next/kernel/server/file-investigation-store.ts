import { promises as fs } from "node:fs";
import path from "node:path";
import type { InvestigationEvent } from "../contracts/investigation-event";
import type { InvestigationId } from "../contracts/investigation-identity";
import type { InvestigationSnapshot } from "../contracts/investigation-snapshot";
import type { InvestigationEventStore } from "../ports/investigation-event-store";
import type { InvestigationRepository } from "../ports/investigation-repository";

const root = path.resolve(process.env.LATTICE_INVESTIGATION_DATA_DIR?.trim() || path.join(process.cwd(), ".lattice-data", "investigations"));
const safeId = (id: InvestigationId) => String(id).replace(/[^a-zA-Z0-9._-]/g, "_");
const snapshotPath = (id: InvestigationId) => path.join(root, safeId(id), "snapshot.json");
const eventsPath = (id: InvestigationId) => path.join(root, safeId(id), "events.json");

async function json<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw error; }
}
async function atomic(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value), "utf8");
  await fs.rename(temporary, file);
}

export class FileInvestigationRepository implements InvestigationRepository {
  async load<TCanonical = unknown>(id: InvestigationId): Promise<InvestigationSnapshot<TCanonical> | undefined> {
    return json<InvestigationSnapshot<TCanonical> | undefined>(snapshotPath(id), undefined);
  }
  async save<TCanonical = unknown>(snapshot: InvestigationSnapshot<TCanonical>, expectedRevision: number): Promise<void> {
    const current = await this.load(snapshot.identity.investigationId);
    if (current && current.identity.revision !== expectedRevision)
      throw new Error(`Investigation revision conflict: expected ${expectedRevision}, found ${current.identity.revision}.`);
    await atomic(snapshotPath(snapshot.identity.investigationId), snapshot);
  }
}

export class FileInvestigationEventStore implements InvestigationEventStore {
  async append(id: InvestigationId, events: readonly InvestigationEvent[], expectedSequence: number): Promise<void> {
    const current = await this.read(id);
    if (current.length !== expectedSequence)
      throw new Error(`Event sequence conflict: expected ${expectedSequence}, found ${current.length}.`);
    await atomic(eventsPath(id), [...current, ...events]);
  }
  async read(id: InvestigationId): Promise<readonly InvestigationEvent[]> {
    return json<InvestigationEvent[]>(eventsPath(id), []);
  }
}
