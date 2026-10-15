export type InvestigationId = string & { readonly __brand: "InvestigationId" };
export type ExecutionId = string & { readonly __brand: "ExecutionId" };
export type CorrelationId = string & { readonly __brand: "CorrelationId" };

export interface InvestigationIdentity {
  investigationId: InvestigationId;
  revision: number;
  executionEpoch: number;
}

export interface ExecutionIdentity extends InvestigationIdentity {
  executionId: ExecutionId;
  correlationId: CorrelationId;
  source: string;
  operation: SourceOperationKind;
  attempt: number;
}

export type SourceOperationKind = "resolve-structure" | "gather-intelligence";

export const asInvestigationId = (value: string): InvestigationId => value as InvestigationId;
export const asExecutionId = (value: string): ExecutionId => value as ExecutionId;
export const asCorrelationId = (value: string): CorrelationId => value as CorrelationId;
