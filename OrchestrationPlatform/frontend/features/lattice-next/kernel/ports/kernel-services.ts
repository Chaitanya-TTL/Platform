import type { CorrelationId, ExecutionId, InvestigationId } from "../contracts/investigation-identity";

export interface InvestigationClock {
  now(): string;
}

export interface InvestigationIdProvider {
  investigationId(): InvestigationId;
  executionId(): ExecutionId;
  correlationId(): CorrelationId;
  eventId(): string;
}
