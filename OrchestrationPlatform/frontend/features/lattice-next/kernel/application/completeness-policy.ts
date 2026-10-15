import type { CompletenessAssessment } from "../contracts/completeness-assessment";
import type { SourceExecutionSnapshot } from "../contracts/investigation-snapshot";

export function assessCompleteness(
  requestedSources: readonly string[],
  executions: Readonly<Record<string, SourceExecutionSnapshot>>,
): CompletenessAssessment {
  const bySource = new Map<string, SourceExecutionSnapshot[]>();
  for (const execution of Object.values(executions)) {
    const list = bySource.get(execution.identity.source) ?? [];
    list.push(execution);
    bySource.set(execution.identity.source, list);
  }

  const successfulSources: string[] = [];
  const partialSources: string[] = [];
  const failedSources: string[] = [];
  const pendingSources: string[] = [];
  const limitations: string[] = [];

  for (const source of requestedSources) {
    const states = bySource.get(source) ?? [];
    if (!states.length || states.some((item) => item.status === "requested" || item.status === "running")) {
      pendingSources.push(source);
      continue;
    }
    if (states.every((item) => item.status === "succeeded" || item.status === "empty")) {
      successfulSources.push(source);
      continue;
    }
    if (states.some((item) => item.status === "succeeded" || item.status === "partial")) {
      partialSources.push(source);
      limitations.push(`${source} returned partial evidence.`);
      continue;
    }
    failedSources.push(source);
    limitations.push(`${source} evidence is unavailable.`);
  }

  const overall: CompletenessAssessment["overall"] = pendingSources.length
    ? "pending"
    : successfulSources.length || partialSources.length
      ? failedSources.length || partialSources.length
        ? "partial"
        : "complete"
      : "failed";

  return {
    overall,
    requestedSources: [...requestedSources],
    successfulSources,
    partialSources,
    failedSources,
    pendingSources,
    limitations,
  };
}
