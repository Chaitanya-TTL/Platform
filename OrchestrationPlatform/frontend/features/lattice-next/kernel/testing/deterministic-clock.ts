import type { CorrelationId, ExecutionId, InvestigationId } from "../contracts/investigation-identity";
import { asCorrelationId, asExecutionId, asInvestigationId } from "../contracts/investigation-identity";
import type { InvestigationClock, InvestigationIdProvider } from "../ports/kernel-services";

export class DeterministicClock implements InvestigationClock {
  constructor(private value = "2026-01-01T00:00:00.000Z") {}
  now(): string { return this.value; }
  set(value: string): void { this.value = value; }
}

export class DeterministicIdProvider implements InvestigationIdProvider {
  private sequence = 0;
  investigationId(): InvestigationId { return asInvestigationId(`investigation-${++this.sequence}`); }
  executionId(): ExecutionId { return asExecutionId(`execution-${++this.sequence}`); }
  correlationId(): CorrelationId { return asCorrelationId(`correlation-${++this.sequence}`); }
  eventId(): string { return `event-${++this.sequence}`; }
}
