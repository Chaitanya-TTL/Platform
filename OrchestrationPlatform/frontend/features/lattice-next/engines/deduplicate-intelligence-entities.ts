import type { EngineeringIntelligenceInvestigationV1, IntelligenceEntity } from "../contracts/intelligence-v1";

export type DeduplicationResult = {
  entities: IntelligenceEntity[];
  aliases: Readonly<Record<string, string>>;
};

const mergeable = (confidence: string) => confidence === "verified" || confidence === "deterministic";

export function deduplicateIntelligenceEntities(input: EngineeringIntelligenceInvestigationV1): DeduplicationResult {
  const byId = new Map(input.entities.map((entity) => [entity.id, entity]));
  const aliases: Record<string, string> = {};

  for (const cluster of [...input.identityClusters].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!mergeable(cluster.confidence)) continue;
    const members = cluster.entityIds.filter((id) => id !== input.subject.id && byId.has(id) && byId.get(id)?.kind !== "source-representation").sort();
    if (members.length < 2) continue;
    const preferred = cluster.preferredEntityId && members.includes(cluster.preferredEntityId) ? cluster.preferredEntityId : members[0];
    for (const id of members) if (id !== preferred) aliases[id] = preferred;
  }

  const entities = [...byId.values()].filter((entity) => !aliases[entity.id]).sort((a, b) => a.id.localeCompare(b.id));
  return { entities, aliases: Object.freeze({ ...aliases }) };
}

export const canonicalEntityId = (id: string, aliases: Readonly<Record<string, string>>) => aliases[id] ?? id;
