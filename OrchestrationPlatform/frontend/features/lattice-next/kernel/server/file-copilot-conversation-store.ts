import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import type { CopilotAnswer, CopilotCitation, CopilotClaim, CopilotRecommendation } from "../../copilot/contracts";
import { CopilotAnswerValidationError } from "../../copilot/answer-validator";
import type {
  CopilotAssistantMessage,
  CopilotConversationStore,
  CopilotConversationThread,
  CopilotThreadSummary,
} from "../ports/copilot-conversation-store";
import type { InvestigationId } from "../contracts/investigation-identity";

export interface FileCopilotConversationStoreOptions {
  maxMessageChars?: number;
  maxMessagesPerThread?: number;
}

const defaultRoot = path.resolve(/* turbopackIgnore: true */ process.env.LATTICE_INVESTIGATION_DATA_DIR?.trim() || path.join(process.cwd(), ".lattice-data", "investigations"));
const validSegment = (value: string) => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value);

async function readJson<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function validateSegment(value: string, label: string): void {
  if (!validSegment(value)) throw new Error(`Invalid ${label}.`);
}

function validateAnswer(answer: CopilotAnswer, snapshotRevision: number): CopilotAnswer {
  if (!answer || typeof answer !== "object" || typeof answer.answer !== "string" || !answer.answer.trim() ||
      !Array.isArray(answer.claims) || !Array.isArray(answer.recommendations) ||
      !Array.isArray(answer.uncertainties) || !Array.isArray(answer.followUpQuestions) ||
      answer.snapshotRevision !== snapshotRevision) {
    throw new CopilotAnswerValidationError("Assistant answer is malformed or has a mismatched snapshot revision.");
  }
  for (const claim of answer.claims) {
    if (!claim || typeof claim.text !== "string" || !["fact", "hypothesis"].includes(claim.kind) || !Array.isArray(claim.citationIds))
      throw new CopilotAnswerValidationError("Assistant answer contains a malformed claim.");
    if (claim.kind === "fact" && claim.citationIds.length === 0)
      throw new CopilotAnswerValidationError("Factual claims require citations from the active snapshot.");
  }
  for (const recommendation of answer.recommendations) {
    if (!recommendation || typeof recommendation.text !== "string" || typeof recommendation.rationale !== "string" ||
        recommendation.approvalRequired !== true || !Array.isArray(recommendation.citationIds) || recommendation.citationIds.length === 0)
      throw new CopilotAnswerValidationError("Recommendations require citations and engineer approval.");
  }
  const claims: CopilotClaim[] = answer.claims.map((claim) => ({
    text: claim.text,
    kind: claim.kind,
    citationIds: [...claim.citationIds],
  }));
  const recommendations: CopilotRecommendation[] = answer.recommendations.map((recommendation) => ({
    text: recommendation.text,
    rationale: recommendation.rationale,
    citationIds: [...recommendation.citationIds],
    approvalRequired: true,
  }));
  let citations: CopilotCitation[] | undefined;
  if (answer.citations !== undefined) {
    if (!Array.isArray(answer.citations) || answer.citations.some((citation) =>
      !citation || typeof citation.citationId !== "string" || !["entity", "relationship", "evidence", "finding", "source", "evaluation"].includes(citation.kind) || typeof citation.label !== "string"))
      throw new CopilotAnswerValidationError("Assistant answer contains malformed citation records.");
    citations = answer.citations.map((citation) => ({
      citationId: citation.citationId,
      kind: citation.kind,
      label: citation.label,
      ...(typeof citation.source === "string" ? { source: citation.source } : {}),
      ...(typeof citation.nativeId === "string" ? { nativeId: citation.nativeId } : {}),
      ...(typeof citation.summary === "string" ? { summary: citation.summary } : {}),
    }));
    const citationIds = new Set(citations.map((citation) => citation.citationId));
    if ([...claims.flatMap((claim) => claim.citationIds), ...recommendations.flatMap((recommendation) => recommendation.citationIds)].some((id) => !citationIds.has(id)))
      throw new CopilotAnswerValidationError("Assistant answer references a citation without a resolved citation record.");
  }
  return {
    answer: answer.answer,
    claims,
    recommendations,
    uncertainties: [...answer.uncertainties],
    followUpQuestions: [...answer.followUpQuestions],
    snapshotRevision,
    ...(citations ? { citations } : {}),
  };
}

export class FileCopilotConversationStore implements CopilotConversationStore {
  private readonly maxMessageChars: number;
  private readonly maxMessagesPerThread: number;
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly rootDirectory = defaultRoot, options: FileCopilotConversationStoreOptions = {}) {
    this.maxMessageChars = options.maxMessageChars ?? 10_000;
    this.maxMessagesPerThread = options.maxMessagesPerThread ?? 100;
  }

  private investigationDirectory(investigationId: InvestigationId): string {
    const id = String(investigationId);
    validateSegment(id, "investigation ID");
    const root = path.resolve(this.rootDirectory);
    const directory = path.resolve(root, id, "copilot", "threads");
    if (!directory.startsWith(`${root}${path.sep}`)) throw new Error("Investigation path is outside the configured root.");
    return directory;
  }

  private threadPath(investigationId: InvestigationId, threadId: string): string {
    validateSegment(threadId, "thread ID");
    return path.join(this.investigationDirectory(investigationId), `${threadId}.json`);
  }

  private async writeAtomic(filePath: string, thread: CopilotConversationThread): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const handle = await fs.open(temporary, "w");
    try {
      await handle.writeFile(JSON.stringify(thread), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await fs.rename(temporary, filePath);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  private async serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => gate);
    this.queues.set(key, queued);
    return previous.then(operation).finally(() => {
      release();
      if (this.queues.get(key) === queued) this.queues.delete(key);
    });
  }

  async listThreads(investigationId: InvestigationId, limit = 20): Promise<readonly CopilotThreadSummary[]> {
    const directory = this.investigationDirectory(investigationId);
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const summaries: CopilotThreadSummary[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const threadId = entry.name.slice(0, -5);
      if (!validSegment(threadId)) continue;
      try {
        const thread = await readJson<CopilotConversationThread>(path.join(directory, entry.name));
        if (!thread || thread.threadId !== threadId || thread.investigationId !== investigationId || !Array.isArray(thread.messages)) continue;
        const latestRevision = [...thread.messages].reverse().find((message) => Number.isSafeInteger(message.snapshotRevision))?.snapshotRevision;
        summaries.push({
          investigationId,
          threadId,
          title: thread.title,
          threadRevision: thread.threadRevision,
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
          messageCount: thread.messages.length,
          ...(latestRevision !== undefined ? { latestSnapshotRevision: latestRevision } : {}),
        });
      } catch {
        continue;
      }
    }
    const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.threadId.localeCompare(right.threadId)).slice(0, boundedLimit);
  }

  async loadThread(investigationId: InvestigationId, threadId: string): Promise<CopilotConversationThread | undefined> {
    const thread = await readJson<CopilotConversationThread>(this.threadPath(investigationId, threadId));
    if (!thread || thread.investigationId !== investigationId || thread.threadId !== threadId) return undefined;
    return thread;
  }

  async createThread(investigationId: InvestigationId, threadId: string, title: string, occurredAt = new Date().toISOString()): Promise<CopilotConversationThread> {
    const filePath = this.threadPath(investigationId, threadId);
    const key = `${investigationId}:${threadId}`;
    return this.serial(key, async () => {
      if (await readJson(filePath)) throw new Error("Copilot thread already exists.");
      const thread: CopilotConversationThread = {
        investigationId,
        threadId,
        title: this.validateMessage(title, "Thread title", 160),
        threadRevision: 0,
        createdAt: occurredAt,
        updatedAt: occurredAt,
        messages: [],
      };
      await this.writeAtomic(filePath, thread);
      return thread;
    });
  }

  async appendUserMessage(investigationId: InvestigationId, threadId: string, expectedThreadRevision: number, message: string, snapshotRevision: number, occurredAt = new Date().toISOString(), idempotencyKey?: string): Promise<CopilotConversationThread> {
    const filePath = this.threadPath(investigationId, threadId);
    const key = `${investigationId}:${threadId}`;
    return this.serial(key, async () => {
      const thread = await readJson<CopilotConversationThread>(filePath);
      if (!thread || thread.investigationId !== investigationId) throw new Error("Copilot thread was not found.");
      if (idempotencyKey && !validSegment(idempotencyKey)) throw new Error("Invalid idempotency key.");
      const pendingMessage = thread.messages.at(-1);
      if (pendingMessage?.role === "user" && idempotencyKey && pendingMessage.idempotencyKey === idempotencyKey &&
          pendingMessage.content === message.trim() && pendingMessage.snapshotRevision === snapshotRevision)
        return thread;
      if (thread.threadRevision !== expectedThreadRevision)
        throw new Error(`Copilot thread revision conflict: expected ${expectedThreadRevision}, found ${thread.threadRevision}.`);
      if (!Number.isSafeInteger(snapshotRevision) || snapshotRevision < 1) throw new Error("Snapshot revision must be a positive integer.");
      if (thread.messages.length >= this.maxMessagesPerThread) throw new Error("Copilot thread history limit has been reached.");
      if (pendingMessage?.role === "user") throw new Error("Copilot thread already has a pending user message.");
      const userMessage = { role: "user" as const, content: this.validateMessage(message, "Message", this.maxMessageChars), at: occurredAt, snapshotRevision, ...(idempotencyKey ? { idempotencyKey } : {}) };
      const updated: CopilotConversationThread = { ...thread, threadRevision: thread.threadRevision + 1, updatedAt: occurredAt, messages: [...thread.messages, userMessage] };
      await this.writeAtomic(filePath, updated);
      return updated;
    });
  }

  async appendTurn(investigationId: InvestigationId, threadId: string, expectedThreadRevision: number, userMessage: string, assistantTurn: Omit<CopilotAssistantMessage, "role">): Promise<CopilotConversationThread> {
    const filePath = this.threadPath(investigationId, threadId);
    const key = `${investigationId}:${threadId}`;
    return this.serial(key, async () => {
      const thread = await readJson<CopilotConversationThread>(filePath);
      if (!thread || thread.investigationId !== investigationId) throw new Error("Copilot thread was not found.");
      if (assistantTurn.idempotencyKey && !validSegment(assistantTurn.idempotencyKey)) throw new Error("Invalid idempotency key.");
      if (assistantTurn.idempotencyKey && thread.messages.some((message) => message.role === "assistant" && message.idempotencyKey === assistantTurn.idempotencyKey))
        return thread;
      if (thread.threadRevision !== expectedThreadRevision)
        throw new Error(`Copilot thread revision conflict: expected ${expectedThreadRevision}, found ${thread.threadRevision}.`);
      const content = this.validateMessage(userMessage, "Message", this.maxMessageChars);
      const safeAnswer = validateAnswer(assistantTurn.answer, assistantTurn.snapshotRevision);
      if (assistantTurn.answer.snapshotRevision !== assistantTurn.snapshotRevision)
        throw new CopilotAnswerValidationError("Assistant answer revision does not match the stored turn revision.");
      const lastMessage = thread.messages.at(-1);
      const pendingUserMessage = lastMessage?.role === "user" ? lastMessage : undefined;
        if (pendingUserMessage && (pendingUserMessage.content !== content || pendingUserMessage.snapshotRevision !== assistantTurn.snapshotRevision ||
          (assistantTurn.idempotencyKey !== undefined && pendingUserMessage.idempotencyKey !== assistantTurn.idempotencyKey)))
        throw new Error("Pending user message does not match the assistant turn.");
      const additions = pendingUserMessage ? 1 : 2;
      if (thread.messages.length + additions > this.maxMessagesPerThread) throw new Error("Copilot thread history limit has been reached.");
      const at = assistantTurn.at;
      const messages = pendingUserMessage
        ? [...thread.messages, { role: "assistant" as const, ...assistantTurn, answer: safeAnswer }]
        : [
            ...thread.messages,
            { role: "user" as const, content, at, snapshotRevision: assistantTurn.snapshotRevision },
            { role: "assistant" as const, ...assistantTurn, answer: safeAnswer },
          ];
      const updated: CopilotConversationThread = {
        ...thread,
        threadRevision: thread.threadRevision + 1,
        updatedAt: at,
        messages,
      };
      await this.writeAtomic(filePath, updated);
      return updated;
    });
  }

  private validateMessage(message: string, label: string, maximum: number): string {
    if (typeof message !== "string" || !message.trim() || message.length > maximum)
      throw new Error(`${label} length must be between 1 and ${maximum} characters.`);
    return message.trim();
  }
}