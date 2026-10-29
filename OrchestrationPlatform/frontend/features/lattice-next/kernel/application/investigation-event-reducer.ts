import type { InvestigationEvent } from "../contracts/investigation-event";
import type { InvestigationSnapshot, SourceExecutionSnapshot } from "../contracts/investigation-snapshot";
import { assessCompleteness } from "./completeness-policy";
import { assertTransition } from "./investigation-transition-policy";
import { executionKey } from "./stale-result-guard";

export function reduceInvestigationEvent(
  current: InvestigationSnapshot | undefined,
  event: InvestigationEvent,
): InvestigationSnapshot {
  if (event.type === "investigation-created") {
    if (current) throw new Error("Investigation already exists.");
    return {
      identity: event.identity,
      lifecycle: "draft",
      subjectLabel: event.subjectLabel,
      query: event.query,
      selections: [...event.selections],
      executions: {},
      acceptedEvidenceIds: [],
      completeness: assessCompleteness(event.selections.map((item) => item.source), {}),
      warnings: [],
      createdAt: event.occurredAt,
      updatedAt: event.occurredAt,
    };
  }
  if (!current) throw new Error("Investigation has not been created.");

  const transition = (lifecycle: InvestigationSnapshot["lifecycle"]): InvestigationSnapshot => {
    assertTransition(current.lifecycle, lifecycle);
    return { ...current, lifecycle, updatedAt: event.occurredAt };
  };

  switch (event.type) {
    case "investigation-begun":
      return transition("resolving");
    case "source-operation-requested": {
      const key = executionKey(event.identity);
      const entry: SourceExecutionSnapshot = {
        identity: event.identity,
        status: "requested",
        warnings: [],
      };
      const executions: Readonly<Record<string, SourceExecutionSnapshot>> = {
        ...current.executions,
        [key]: entry,
      };
      return {
        ...current,
        executions,
        completeness: assessCompleteness(current.selections.map((item) => item.source), executions),
        updatedAt: event.occurredAt,
      };
    }
    case "source-operation-started": {
      const key = executionKey(event.identity);
      const prior = current.executions[key];
      if (!prior) return current;
      const entry: SourceExecutionSnapshot = {
        ...prior,
        status: "running",
        startedAt: event.occurredAt,
      };
      const executions: Readonly<Record<string, SourceExecutionSnapshot>> = {
        ...current.executions,
        [key]: entry,
      };
      return {
        ...current,
        lifecycle: event.identity.operation === "resolve-structure" ? "resolving" : "gathering",
        executions,
        completeness: assessCompleteness(current.selections.map((item) => item.source), executions),
        updatedAt: event.occurredAt,
      };
    }
    case "source-operation-completed": {
      const key = executionKey(event.result.identity);
      const prior = current.executions[key];
      if (!prior) return current;
      const entry: SourceExecutionSnapshot = {
        identity: event.result.identity,
        status: event.result.status,
        startedAt: event.result.startedAt,
        completedAt: event.result.completedAt,
        capturedAt: event.result.evidence?.observedAt,
        freshness: event.result.evidence?.freshness ?? "unknown",
        warnings: event.result.warnings,
        errorCode: event.result.error?.code,
        errorMessage: event.result.error?.message,
      };
      const executions: Readonly<Record<string, SourceExecutionSnapshot>> = {
        ...current.executions,
        [key]: entry,
      };
      const evidenceId = event.result.evidence
        ? `${event.result.identity.executionId}:${event.result.identity.operation}`
        : undefined;
      const acceptedEvidenceIds =
        evidenceId && event.result.evidence?.validation.status === "accepted"
          ? [...new Set([...current.acceptedEvidenceIds, evidenceId])]
          : current.acceptedEvidenceIds;
      return {
        ...current,
        executions,
        acceptedEvidenceIds,
        completeness: assessCompleteness(current.selections.map((item) => item.source), executions),
        updatedAt: event.occurredAt,
      };
    }
    case "canonical-assembly-requested":
      return transition("assembling");
    case "canonical-published": { const completeness=assessCompleteness(current.selections.map(x=>x.source),current.executions); const lifecycle=completeness.overall==="complete"?"ready":completeness.overall==="failed"?"failed":"partial"; assertTransition(current.lifecycle,lifecycle); return {...current,lifecycle,canonical:{revision:event.revision,publishedAt:event.occurredAt,value:event.canonical},completeness,updatedAt:event.occurredAt}; }
    case "investigation-refreshed": { assertTransition(current.lifecycle,"refreshing"); return {...current,identity:event.identity,lifecycle:"refreshing",executions:{},completeness:assessCompleteness(current.selections.map(x=>x.source),{}),warnings:[],updatedAt:event.occurredAt}; }
    case "investigation-archived":
      return { ...current, archivedAt: event.occurredAt, updatedAt: event.occurredAt };
    case "investigation-restored": {
      const { archivedAt: _archivedAt, ...restored } = current;
      return { ...restored, updatedAt: event.occurredAt };
    }
    case "investigation-cancelled":
      return transition("cancelled");
    case "investigation-failed": { assertTransition(current.lifecycle,"failed"); return {...current,lifecycle:"failed",warnings:[...current.warnings,`${event.code}: ${event.message}`],updatedAt:event.occurredAt}; }
    case "stale-result-rejected":
      return {...current,warnings:[...current.warnings,`Rejected stale ${event.identity.source}/${event.identity.operation} result: ${event.reason}`],updatedAt:event.occurredAt};
  }
}
