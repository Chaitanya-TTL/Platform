import type { CopilotAnswer } from "../../copilot/contracts";
import type { InvestigationId } from "../contracts/investigation-identity";

export interface CopilotUserMessage {
  role: "user";
  content: string;
  at: string;
  snapshotRevision: number;
  idempotencyKey?: string;
}

export interface CopilotAssistantMessage {
  role: "assistant";
  answer: CopilotAnswer;
  at: string;
  snapshotRevision: number;
  idempotencyKey?: string;
}

export type CopilotConversationMessage = CopilotUserMessage | CopilotAssistantMessage;

export interface CopilotConversationThread {
  investigationId: InvestigationId;
  threadId: string;
  title: string;
  threadRevision: number;
  createdAt: string;
  updatedAt: string;
  messages: readonly CopilotConversationMessage[];
}

export interface CopilotThreadSummary {
  investigationId: InvestigationId;
  threadId: string;
  title: string;
  threadRevision: number;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  latestSnapshotRevision?: number;
}

export interface CopilotConversationStore {
  listThreads(investigationId: InvestigationId, limit?: number): Promise<readonly CopilotThreadSummary[]>;
  loadThread(investigationId: InvestigationId, threadId: string): Promise<CopilotConversationThread | undefined>;
  createThread(investigationId: InvestigationId, threadId: string, title: string, occurredAt?: string): Promise<CopilotConversationThread>;
  appendUserMessage(investigationId: InvestigationId, threadId: string, expectedThreadRevision: number, message: string, snapshotRevision: number, occurredAt?: string, idempotencyKey?: string): Promise<CopilotConversationThread>;
  appendTurn(investigationId: InvestigationId, threadId: string, expectedThreadRevision: number, userMessage: string, assistantTurn: Omit<CopilotAssistantMessage, "role">): Promise<CopilotConversationThread>;
}