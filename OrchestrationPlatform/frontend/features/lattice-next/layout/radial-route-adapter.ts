import type { LayoutRoute, RadialLayoutConnection } from "./layout-contract";

export function applyRadialFirstHopRoutes(
  routes: Readonly<Record<string, LayoutRoute>>,
  connections: Readonly<Record<string, RadialLayoutConnection>>,
): Record<string, LayoutRoute> {
  const next = { ...routes };
  for (const [edgeId, connection] of Object.entries(connections).sort(([a], [b]) => a.localeCompare(b))) {
    const existing = routes[edgeId];
    const start = { ...connection.source.position };
    const end = { ...connection.target.position };
    next[edgeId] = {
      edgeId,
      start,
      bends: [],
      end,
      family: existing?.family ?? "structure",
      lane: existing?.lane,
      label: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      fallback: false,
    };
  }
  return next;
}
