import type { CopilotCitation } from "../copilot/contracts";
import { parseNavigableCitationId } from "../copilot/citation-id";
import type { RelationshipProjection } from "../contracts/projection";
import type {
  EngineeringEntity,
  EngineeringRelationship,
  InvestigationGraph,
  RelationshipKind,
} from "../domain/model";
import type { InvestigationGraphCore } from "./investigation-graph";

export interface CitedGraphProjection {
  projection: RelationshipProjection;
  unresolvedCitations: readonly CopilotCitation[];
}

type ParentPath = {
  entityIds: string[];
  relationshipIds: string[];
};

const hierarchyKinds = new Set<RelationshipKind>(["contains", "represented-by"]);

function shortestParentPath(
  targetId: string,
  entityIds: ReadonlySet<string>,
  domainRelationships: readonly EngineeringRelationship[],
  core: InvestigationGraphCore,
): ParentPath {
  const queue: ParentPath[] = [{ entityIds: [targetId], relationshipIds: [] }];
  const visited = new Set([targetId]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const currentId = path.entityIds[0];
    const parentEdges = [...new Set(core.parents(currentId))]
      .filter((parentId) => entityIds.has(parentId))
      .sort()
      .flatMap((parentId) => {
        const relationship = domainRelationships
          .filter(
            (item) =>
              item.from === parentId &&
              item.to === currentId &&
              hierarchyKinds.has(item.kind),
          )
          .sort((left, right) => left.id.localeCompare(right.id))[0];
        return relationship ? [{ parentId, relationship }] : [];
      });

    if (parentEdges.length === 0) return path;

    for (const { parentId, relationship } of parentEdges) {
      if (visited.has(parentId)) continue;
      visited.add(parentId);
      queue.push({
        entityIds: [parentId, ...path.entityIds],
        relationshipIds: [relationship.id, ...path.relationshipIds],
      });
    }
  }

  return { entityIds: [targetId], relationshipIds: [] };
}

function projectEntity(
  entity: EngineeringEntity,
  domain: InvestigationGraph,
  directlyCitedEntityIds: ReadonlySet<string>,
  pathRelationshipIds: ReadonlySet<string>,
) {
  const childCount = domain.relationships.filter(
    (relationship) =>
      pathRelationshipIds.has(relationship.id) &&
      relationship.from === entity.id &&
      hierarchyKinds.has(relationship.kind),
  ).length;

  return {
    id: entity.id,
    label: entity.name,
    subtitle:
      entity.source === "unified"
        ? `${entity.representationSources?.length ?? 0} selected source representations · investigation subject`
        : `${entity.provenance.sourceLabel} · ${entity.kind}`,
    kind: entity.kind,
    source: entity.source,
    level: entity.level,
    selected: directlyCitedEntityIds.has(entity.id),
    expanded: true,
    hasChildren: childCount > 0,
    hiddenChildren: 0,
    provenanceSources: entity.representationSources,
    nativeIdentifier: entity.provenance.nativeId ?? entity.sourceNodeId,
    revision:
      String(entity.attributes.Revision ?? entity.attributes.revision ?? "") ||
      undefined,
    capturedAt: entity.provenance.capturedAt,
    attributes: entity.attributes,
    relationshipCount: domain.relationships.filter(
      (relationship) =>
        relationship.from === entity.id || relationship.to === entity.id,
    ).length,
    childCount,
    matchConfidence: domain.relationships.find(
      (relationship) =>
        relationship.to === entity.id && relationship.kind === "represented-by",
    )?.confidence,
    resolutionState: String(entity.attributes["Resolution Status"] ?? "ready"),
    dimmed: !directlyCitedEntityIds.has(entity.id),
  };
}

export function projectCitedGraph(
  domain: InvestigationGraph,
  core: InvestigationGraphCore,
  citations: readonly CopilotCitation[],
): CitedGraphProjection {
  const entitiesById = new Map(domain.entities.map((entity) => [entity.id, entity]));
  const relationshipsById = new Map(
    domain.relationships.map((relationship) => [relationship.id, relationship]),
  );
  const domainEntityIds = new Set(entitiesById.keys());
  const directlyCitedEntityIds = new Set<string>();
  const directlyCitedRelationshipIds = new Set<string>();
  const anchorEntityIds = new Set<string>();
  const unresolvedCitations: CopilotCitation[] = [];

  for (const citation of citations) {
    if (citation.kind !== "entity" && citation.kind !== "relationship") continue;

    const target = parseNavigableCitationId(citation);
    if (!target) {
      unresolvedCitations.push(citation);
      continue;
    }

    if (target.kind === "entity") {
      if (!entitiesById.has(target.id)) {
        unresolvedCitations.push(citation);
        continue;
      }

      directlyCitedEntityIds.add(target.id);
      anchorEntityIds.add(target.id);
      continue;
    }

    const relationship = relationshipsById.get(target.id);
    if (
      !relationship ||
      !domainEntityIds.has(relationship.from) ||
      !domainEntityIds.has(relationship.to)
    ) {
      unresolvedCitations.push(citation);
      continue;
    }

    directlyCitedRelationshipIds.add(relationship.id);
    anchorEntityIds.add(relationship.from);
    anchorEntityIds.add(relationship.to);
  }

  const visibleEntityIds = new Set<string>();
  const pathRelationshipIds = new Set<string>();
  for (const targetId of [...anchorEntityIds].sort()) {
    const path = shortestParentPath(
      targetId,
      domainEntityIds,
      domain.relationships,
      core,
    );
    path.entityIds.forEach((id) => visibleEntityIds.add(id));
    path.relationshipIds.forEach((id) => pathRelationshipIds.add(id));
  }

  const visibleRelationshipIds = new Set([
    ...directlyCitedRelationshipIds,
    ...pathRelationshipIds,
  ]);
  const visibleEntities = domain.entities
    .filter((entity) => visibleEntityIds.has(entity.id))
    .sort((left, right) => left.id.localeCompare(right.id));
  const visibleRelationships = domain.relationships
    .filter(
      (relationship) =>
        visibleRelationshipIds.has(relationship.id) &&
        visibleEntityIds.has(relationship.from) &&
        visibleEntityIds.has(relationship.to),
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  const nodes = visibleEntities.map((entity) =>
    projectEntity(
      entity,
      domain,
      directlyCitedEntityIds,
      pathRelationshipIds,
    ),
  );
  const edges = visibleRelationships.map((relationship) => {
    const label = relationship.label ?? relationship.kind.replaceAll("-", " ");
    return {
      id: relationship.id,
      source: relationship.from,
      target: relationship.to,
      kind: relationship.kind,
      selected: directlyCitedRelationshipIds.has(relationship.id),
      label,
      fullLabel: label,
      confidence: relationship.confidence,
    };
  });

  return {
    projection: {
      nodes,
      edges,
      structuralKey:
        nodes.map((node) => node.id).join("|") +
        "::" +
        edges.map((edge) => edge.id).join("|"),
    },
    unresolvedCitations,
  };
}
