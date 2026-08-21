import type { LatticeHandoff } from "../contracts/handoff";
import type {
  EngineeringEntity,
  EngineeringRelationship,
  InvestigationGraph,
} from "../domain/model";

type ScalarAttribute = string | number | boolean;
type EntityAttributes = Record<string, ScalarAttribute>;

const text = (value: unknown): string => String(value ?? "").trim();

function relationshipQuantity(
  attributes: EntityAttributes,
): string | number | undefined {
  const value = attributes.Qty ?? attributes.Quantity;

  return typeof value === "string" || typeof value === "number"
    ? value
    : undefined;
}

function identity(
  name: string,
  attributes: EntityAttributes = {},
): {
  key: string;
  verified: boolean;
  reason: string;
} {
  const raw = text(
    attributes["Item ID"] ??
      attributes["Part Number"] ??
      attributes.Number,
  );

  return {
    key: (raw || name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim(),
    verified: Boolean(raw),
    reason: raw
      ? "source identifier match"
      : "exact normalized name match",
  };
}

export function buildInvestigation(
  handoff: LatticeHandoff,
): InvestigationGraph {
  const entities: EngineeringEntity[] = [];
  const relationships: EngineeringRelationship[] = [];
  const roots: string[] = [];

  const matches = new Map<
    string,
    {
      id: string;
      source: string;
      verified: boolean;
      reason: string;
    }[]
  >();

  handoff.sources.forEach((source, sourceIndex) => {
    const visit = (
      node: typeof source.root,
      level: number,
      parentId?: string,
      path: number[] = [sourceIndex],
    ): void => {
      const id = `${source.source}:${path.join(".")}:${node.id}`;
      const attributes = node.attributes ?? {};

      const entity: EngineeringEntity = {
        id,
        sourceNodeId: node.id,
        source: source.source,
        name: node.name,
        kind: node.children?.length ? "assembly" : "component",
        level,
        attributes,
        provenance: {
          sourceLabel: source.label,
          nativeId: source.nativeId,
          capturedAt: source.capturedAt,
        },
      };

      entities.push(entity);

      if (!parentId) {
        roots.push(id);
      } else {
        relationships.push({
          id: `contains:${parentId}:${id}`,
          from: parentId,
          to: id,
          kind: "contains",
          quantity: relationshipQuantity(attributes),
          evidence: [
            {
              sourceLabel: source.label,
              reason: "direct BOM parent-child occurrence",
              nativeId: source.nativeId,
              capturedAt: source.capturedAt,
            },
          ],
        });
      }

      const match = identity(node.name, attributes);

      if (match.key) {
        matches.set(match.key, [
          ...(matches.get(match.key) ?? []),
          {
            id,
            source: source.source,
            verified: match.verified,
            reason: match.reason,
          },
        ]);
      }

      node.children?.forEach((child, index) => {
        visit(child, level + 1, id, [...path, index]);
      });
    };

    visit(source.root, 0);
  });

  for (const group of matches.values()) {
    const perSource = [
      ...new Map(group.map((candidate) => [candidate.source, candidate])).values(),
    ];

    const primary = perSource[0];

    if (!primary) {
      continue;
    }

    for (let index = 1; index < perSource.length; index += 1) {
      const counterpart = perSource[index];

      if (!counterpart) {
        continue;
      }

      const verified = primary.verified && counterpart.verified;

      relationships.push({
        id: `corresponds:${primary.id}:${counterpart.id}`,
        from: primary.id,
        to: counterpart.id,
        kind: "corresponds-to",
        confidence: verified ? 1 : 0.72,
        verified,
        evidence: [
          {
            sourceLabel: "Cross-source correspondence",
            reason: verified
              ? "verified identifier match"
              : primary.reason,
          },
        ],
      });
    }
  }

  return {
    entities,
    relationships,
    roots,
    byId: Object.fromEntries(
      entities.map((entity) => [entity.id, entity]),
    ),
    relationshipById: Object.fromEntries(
      relationships.map((relationship) => [
        relationship.id,
        relationship,
      ]),
    ),
  };
}