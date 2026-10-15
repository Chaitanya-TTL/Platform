export interface CompletenessAssessment {
  overall: "complete" | "partial" | "failed" | "pending";
  requestedSources: readonly string[];
  successfulSources: readonly string[];
  partialSources: readonly string[];
  failedSources: readonly string[];
  pendingSources: readonly string[];
  limitations: readonly string[];
}
