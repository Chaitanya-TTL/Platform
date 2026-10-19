"use client";

import { asCorrelationId, asExecutionId, asInvestigationId } from "../contracts/investigation-identity";
import type { InvestigationClock, InvestigationIdProvider } from "../ports/kernel-services";

export class BrowserInvestigationClock implements InvestigationClock {
  now(): string { return new Date().toISOString(); }
}

export class BrowserInvestigationIdProvider implements InvestigationIdProvider {
  investigationId() { return asInvestigationId(`lattice-${crypto.randomUUID()}`); }
  executionId() { return asExecutionId(`execution-${crypto.randomUUID()}`); }
  correlationId() { return asCorrelationId(`correlation-${crypto.randomUUID()}`); }
  eventId() { return `event-${crypto.randomUUID()}`; }
}
