import type { EngineeringIntelligenceInvestigationV1 } from "../contracts/intelligence-v1";
import type { InvestigationSnapshot } from "../kernel/contracts/investigation-snapshot";
import type { InvestigationRefreshResult } from "../kernel/infrastructure/current-investigation-runtime";

export interface InvestigationReviewCue {
  id: string;
  title: string;
  detail: string;
  prompt: string;
  citationEntityIds: readonly string[];
}

function canonicalOf(snapshot: InvestigationSnapshot<unknown>): EngineeringIntelligenceInvestigationV1 | undefined {
  const value = snapshot.canonical?.value;
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<EngineeringIntelligenceInvestigationV1>;
  return candidate.contractVersion === "1.0" && Array.isArray(candidate.entities) && Array.isArray(candidate.relationships)
    ? candidate as EngineeringIntelligenceInvestigationV1
    : undefined;
}

function conflictGroups(canonical: EngineeringIntelligenceInvestigationV1) {
  const groups = new Map<string, Map<string, { source: string; entityId: string; value: string }>>();
  for (const entity of canonical.entities) {
    const source = entity.provenance.source;
    if (!source) continue;
    for (const [property, raw] of Object.entries(entity.properties)) {
      const value = typeof raw.text === "string" ? raw.text.trim() : raw.number !== undefined ? String(raw.number) : "";
      if (!value) continue;
      const key = property.toLocaleLowerCase();
      const values = groups.get(key) ?? new Map<string, { source: string; entityId: string; value: string }>();
      values.set(`${source}:${value}`, { source, entityId: entity.id, value });
      groups.set(key, values);
    }
  }
  return [...groups.entries()].flatMap(([property, values]) => {
    const entries = [...values.values()];
    return new Set(entries.map((entry) => entry.source)).size > 1 && new Set(entries.map((entry) => entry.value)).size > 1
      ? [{ property, entries }]
      : [];
  });
}

export function buildInvestigationReviewCues(
  snapshot: InvestigationSnapshot<unknown>,
  refresh?: InvestigationRefreshResult | null,
): InvestigationReviewCue[] {
  const cues: InvestigationReviewCue[] = [];
  const unavailable = [...new Set([...snapshot.completeness.partialSources, ...snapshot.completeness.failedSources])].sort();
  if (unavailable.length) {
    cues.push({
      id: `coverage:${unavailable.join(",")}`,
      title: "Source coverage is incomplete",
      detail: `Evidence is partial or unavailable for ${unavailable.join(", ")}.`,
      prompt: `Explain the incomplete source coverage for ${unavailable.join(", ")} and what cannot be concluded from this snapshot.`,
      citationEntityIds: [],
    });
  }

  const canonical = canonicalOf(snapshot);
  const unresolved = canonical?.universalRelationshipEvaluations?.filter((item) => item.status === "unresolved") ?? [];
  if (unresolved.length) {
    cues.push({
      id: `unresolved:${unresolved.map((item) => item.ruleId).sort().join(",")}`,
      title: "Some approved relationships remain unresolved",
      detail: `${unresolved.length} relationship evaluation${unresolved.length === 1 ? "" : "s"} could not be resolved from selected evidence.`,
      prompt: "Explain the unresolved approved relationships in this investigation and identify the evidence gap for each.",
      citationEntityIds: [...new Set(unresolved.flatMap((item) => item.sourceCandidates.map((candidate) => candidate.entityId)))].sort(),
    });
  }

  const staleSources = [...new Set(Object.values(snapshot.executions)
    .filter((execution) => execution.freshness === "stale" || execution.status === "failed" || execution.status === "unavailable" || execution.status === "timed-out")
    .map((execution) => execution.identity.source))].sort();
  if (staleSources.length) {
    const affected = canonical?.entities.filter((entity) => entity.provenance.source && staleSources.includes(entity.provenance.source)) ?? [];
    cues.push({
      id: `stale:${staleSources.join(",")}`,
      title: "Some source evidence may be stale",
      detail: `Review the last-known values from ${staleSources.join(", ")} before relying on them.`,
      prompt: `Explain which values from ${staleSources.join(", ")} are stale or unavailable and how that limits this investigation.`,
      citationEntityIds: affected.map((entity) => entity.id).sort(),
    });
  }

  const conflicts = canonical ? conflictGroups(canonical) : [];
  if (conflicts.length) {
    cues.push({
      id: `conflicts:${conflicts.map((item) => item.property).sort().join(",")}`,
      title: "Conflicting source values need review",
      detail: `${conflicts.length} property${conflicts.length === 1 ? "" : "ies"} differs across source records.`,
      prompt: "Compare the conflicting source values in this snapshot. Keep each source's value separate and explain what remains unverified.",
      citationEntityIds: [...new Set(conflicts.flatMap((item) => item.entries.map((entry) => entry.entityId)))].sort(),
    });
  }

  if (refresh && (refresh.changedEntityIds.length || refresh.addedEntityIds.length || refresh.removedEntityIds.length)) {
    cues.push({
      id: `refresh:${refresh.revision}`,
      title: `Revision ${refresh.revision} changed`,
      detail: `${refresh.changedEntityIds.length} changed, ${refresh.addedEntityIds.length} added, ${refresh.removedEntityIds.length} removed.`,
      prompt: `Explain changes from revision ${refresh.previousRevision} to ${refresh.revision}, including added, changed, and removed entities, using only the current snapshot evidence.`,
      citationEntityIds: [...new Set([...refresh.changedEntityIds, ...refresh.addedEntityIds])].sort(),
    });
  }

  return cues;
}
