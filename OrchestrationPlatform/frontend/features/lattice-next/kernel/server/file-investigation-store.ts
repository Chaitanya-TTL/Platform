import { promises as fs } from "node:fs";
import path from "node:path";
import type { InvestigationEvent } from "../contracts/investigation-event";
import type { InvestigationId } from "../contracts/investigation-identity";
import type { InvestigationListItem, InvestigationSnapshot } from "../contracts/investigation-snapshot";
import { toInvestigationListItem } from "../application/investigation-list-item";
import type { InvestigationEventStore } from "../ports/investigation-event-store";
import type { InvestigationListOptions, InvestigationRepository } from "../ports/investigation-repository";

const defaultRoot = path.resolve(/* turbopackIgnore: true */ process.env.LATTICE_INVESTIGATION_DATA_DIR?.trim() || path.join(process.cwd(), ".lattice-data", "investigations"));
const safeId = (id: InvestigationId) => String(id).replace(/[^a-zA-Z0-9._-]/g, "_");
const validDirectoryId = (value: string) => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value);

async function json<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw error; }
}
async function atomic(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const handle = await fs.open(temporary, "w");
  try { await handle.writeFile(JSON.stringify(value), "utf8"); await handle.sync(); }
  finally { await handle.close(); }
  try { await retryTransient(() => fs.rename(temporary, file)); }
  finally { await fs.rm(temporary, { force: true }).catch(() => undefined); }
}
async function retryTransient(work: () => Promise<void>): Promise<void> {
  const delays = [25, 50, 100, 200, 400, 800, 1200, 1800];
  for (let attempt = 0; ; attempt++) {
    try { await work(); return; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const transient = code === "EPERM" || code === "EBUSY" || code === "EACCES";
      if (!transient || attempt >= delays.length) throw new Error(transient ? "Investigation storage is temporarily locked after bounded retries." : error instanceof Error ? error.message : "Investigation persistence failed.");
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}

export class FileInvestigationRepository implements InvestigationRepository {
  constructor(private readonly rootDirectory = defaultRoot) {}

  private snapshotPath(id: InvestigationId): string {
    return path.join(this.rootDirectory, safeId(id), "snapshot.json");
  }

  async load<TCanonical = unknown>(id: InvestigationId): Promise<InvestigationSnapshot<TCanonical> | undefined> {
    return json<InvestigationSnapshot<TCanonical> | undefined>(this.snapshotPath(id), undefined);
  }

  async save<TCanonical = unknown>(snapshot: InvestigationSnapshot<TCanonical>, expectedRevision: number): Promise<void> {
    const current = await this.load(snapshot.identity.investigationId);
    if (current && current.identity.revision !== expectedRevision)
      throw new Error(`Investigation revision conflict: expected ${expectedRevision}, found ${current.identity.revision}.`);
    await atomic(this.snapshotPath(snapshot.identity.investigationId), snapshot);
  }

  async list(options: InvestigationListOptions = {}): Promise<readonly InvestigationListItem[]> {
    const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(100, Math.floor(options.limit!))) : 20;
    let entries;
    try {
      entries = await fs.readdir(this.rootDirectory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    const root = path.resolve(this.rootDirectory);
    const items: InvestigationListItem[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !validDirectoryId(entry.name)) continue;
      const directory = path.resolve(root, entry.name);
      if (path.dirname(directory) !== root) continue;
      try {
        const snapshot = await json<InvestigationSnapshot | undefined>(path.join(directory, "snapshot.json"), undefined);
        if (!snapshot || snapshot.identity?.investigationId !== entry.name || !snapshot.subjectLabel || !Number.isFinite(snapshot.identity.revision)) continue;
        if (!options.includeArchived && snapshot.archivedAt) continue;
        items.push(toInvestigationListItem(snapshot));
      } catch {
        continue;
      }
    }
    return items
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || String(left.investigationId).localeCompare(String(right.investigationId)))
      .slice(0, limit);
  }
}

export class FileInvestigationEventStore implements InvestigationEventStore {
  constructor(private readonly rootDirectory = defaultRoot) {}

  private eventsPath(id: InvestigationId): string {
    return path.join(this.rootDirectory, safeId(id), "events.json");
  }

  async append(id: InvestigationId, events: readonly InvestigationEvent[], expectedSequence: number): Promise<void> {
    const current = await this.read(id);
    if (current.length !== expectedSequence)
      throw new Error(`Event sequence conflict: expected ${expectedSequence}, found ${current.length}.`);
    await atomic(this.eventsPath(id), [...current, ...events]);
  }

  async read(id: InvestigationId): Promise<readonly InvestigationEvent[]> {
    return json<InvestigationEvent[]>(this.eventsPath(id), []);
  }
}
