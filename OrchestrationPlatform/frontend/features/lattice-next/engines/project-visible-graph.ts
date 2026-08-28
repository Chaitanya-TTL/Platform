import type { InvestigationGraphCore } from "./investigation-graph";
import type {
  InvestigationGraph,
  InvestigationSelection,
  RelationshipKind,
} from "../domain/model";
import type { RelationshipProjection } from "../contracts/projection";
export type ProjectionOptions = {
  expanded: ReadonlySet<string>;
  selection: InvestigationSelection;
  query: string;
  focusRoot: string | null;
  sources: ReadonlySet<string>;
  relationships: ReadonlySet<RelationshipKind>;
};
export function projectVisibleGraph(
  domain: InvestigationGraph,
  core: InvestigationGraphCore,
  options: ProjectionOptions,
): RelationshipProjection {
  const visible = new Set<string>(),
    allowed = (id: string) =>
      domain.byId[id]?.source === "unified" ||
      options.sources.has(domain.byId[id]?.source),
    reveal = (id: string) => {
      if (!domain.byId[id] || !allowed(id)) return;
      visible.add(id);
      if (options.expanded.has(id)) core.children(id).forEach(reveal);
    };
  domain.roots.forEach(reveal);
  const focusContext = options.focusRoot
    ? new Set([options.focusRoot, ...core.ancestors(options.focusRoot), ...core.neighbourhood(options.focusRoot), ...core.descendants(options.focusRoot)])
    : null;
  if (options.focusRoot) {
    core.pathToRoot(options.focusRoot).forEach((id) => visible.add(id));
    core.neighbourhood(options.focusRoot).forEach((id) => visible.add(id));
    reveal(options.focusRoot);
  }
  const query = options.query.trim().toLowerCase();
  if (query)
    domain.entities
      .filter(
        (entity) =>
          allowed(entity.id) &&
          `${entity.name} ${entity.sourceNodeId}`.toLowerCase().includes(query),
      )
      .forEach((entity) =>
        core.pathToRoot(entity.id).forEach((id) => visible.add(id)),
      );
  if (options.selection.type === "entity") visible.add(options.selection.id);
  const nodes = domain.entities
    .filter((entity) => visible.has(entity.id))
    .map((entity) => ({
      id: entity.id,
      label: entity.name,
      subtitle:
        entity.source === "unified"
          ? `${entity.representationSources?.length ?? 0} selected source representations Â· investigation subject`
          : `${entity.provenance.sourceLabel} Â· ${entity.kind}`,
      kind: entity.kind,
      source: entity.source,
      level: entity.level,
      selected:
        options.selection.type === "entity" &&
        options.selection.id === entity.id,
      expanded: options.expanded.has(entity.id),
      hasChildren: core.children(entity.id).length > 0,
      hiddenChildren: options.expanded.has(entity.id)
        ? 0
        : core.children(entity.id).length,
      provenanceSources: entity.representationSources,
      nativeIdentifier: entity.provenance.nativeId ?? entity.sourceNodeId,
      revision: String(entity.attributes.Revision ?? entity.attributes.revision ?? "") || undefined,
      capturedAt: entity.provenance.capturedAt,
      attributes: entity.attributes,
      relationshipCount: domain.relationships.filter((item) => item.from === entity.id || item.to === entity.id).length,
      childCount: core.children(entity.id).length,
      matchConfidence: domain.relationships.find((item) => item.to === entity.id && item.kind === "represented-by")?.confidence,
      resolutionState: String(entity.attributes["Resolution Status"] ?? "ready"),
      dimmed: Boolean(focusContext && !focusContext.has(entity.id)),
    }));
  const edges = domain.relationships
    .filter(
      (relationship) =>
        visible.has(relationship.from) &&
        visible.has(relationship.to) &&
        (relationship.kind === "represented-by" ||
          options.relationships.has(relationship.kind)),
    )
    .map((relationship) => {
      const fullLabel =
        relationship.label ??
        (relationship.kind === "contains"
          ? relationship.quantity
            ? `Contains Â· Qty ${relationship.quantity}`
            : "Contains"
          : relationship.verified
            ? "Same product Â· Verified"
            : `Likely match Â· ${Math.round((relationship.confidence ?? 0) * 100)}%`);
      return {
        id: relationship.id,
        source: relationship.from,
        target: relationship.to,
        kind: relationship.kind,
        selected:
          options.selection.type === "relationship" &&
          options.selection.id === relationship.id,
        label: fullLabel,
        fullLabel,
        confidence: relationship.confidence,
      };
    });
  return {
    nodes,
    edges,
    structuralKey:
      [...visible].sort().join("|") +
      "::" +
      edges
        .map((edge) => edge.id)
        .sort()
        .join("|"),
  };
}




