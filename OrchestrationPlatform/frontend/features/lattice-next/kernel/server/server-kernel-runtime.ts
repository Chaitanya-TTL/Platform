import { InvestigationCommandHandler } from "../application/investigation-command-handler";
import { InvestigationKernel } from "../application/investigation-kernel";
import { asCorrelationId, asExecutionId, asInvestigationId } from "../contracts/investigation-identity";
import type { InvestigationClock, InvestigationIdProvider } from "../ports/kernel-services";
import { FileInvestigationEventStore, FileInvestigationRepository } from "./file-investigation-store";

class ServerClock implements InvestigationClock { now() { return new Date().toISOString(); } }
class ServerIds implements InvestigationIdProvider {
  investigationId() { return asInvestigationId(`lattice-${crypto.randomUUID()}`); }
  executionId() { return asExecutionId(`execution-${crypto.randomUUID()}`); }
  correlationId() { return asCorrelationId(`correlation-${crypto.randomUUID()}`); }
  eventId() { return `event-${crypto.randomUUID()}`; }
}

const shared = globalThis as typeof globalThis & { __latticeKernel?: InvestigationKernel; __latticeClock?: ServerClock; __latticeIds?: ServerIds };
export const serverClock = shared.__latticeClock ??= new ServerClock();
export const serverIds = shared.__latticeIds ??= new ServerIds();
export const serverKernel = shared.__latticeKernel ??= new InvestigationKernel(
  new FileInvestigationRepository(),
  new FileInvestigationEventStore(),
  new InvestigationCommandHandler(serverIds),
);
