import type { InvestigationListItem, InvestigationListSourceStatus, InvestigationSnapshot } from "../contracts/investigation-snapshot";

export function toInvestigationListItem(snapshot: InvestigationSnapshot): InvestigationListItem {
  const sources = [...new Set(snapshot.selections.map((selection) => selection.source))];
  const sourceStatuses: InvestigationListSourceStatus[] = sources.map((source) => {
    const latest = Object.values(snapshot.executions)
      .filter((execution) => execution.identity.source === source)
      .sort((left, right) => (right.completedAt ?? right.startedAt ?? "").localeCompare(left.completedAt ?? left.startedAt ?? ""))[0];
    return {
      source,
      status: latest?.status ?? "not-started",
      ...(latest?.capturedAt ? { capturedAt: latest.capturedAt } : {}),
      freshness: latest?.freshness ?? "unknown",
    };
  });
  const capturedAt = sourceStatuses
    .map((status) => status.capturedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return {
    investigationId: snapshot.identity.investigationId,
    subjectLabel: snapshot.subjectLabel,
    lifecycle: snapshot.lifecycle,
    revision: snapshot.identity.revision,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    ...(snapshot.archivedAt ? { archivedAt: snapshot.archivedAt } : {}),
    sourceStatuses,
    capturedFreshness: {
      ...(capturedAt ? { capturedAt } : {}),
      freshness: sourceStatuses.some((status) => status.freshness === "stale")
        ? "stale"
        : sourceStatuses.length > 0 && sourceStatuses.every((status) => status.freshness === "current")
          ? "current"
          : "unknown",
    },
  };
}