import type { QueryIntent } from "./contracts";
export function normalizeQuery(value: string) { return value.trim().replace(/\s+/g, " "); }
export function classifyQueryIntent(value: string): QueryIntent {
  const query = normalizeQuery(value);
  if (!query) return "unknown";
  const looksLikeIdentifier = /^[A-Z0-9._:/-]+$/i.test(query) && /\d/.test(query);
  return looksLikeIdentifier ? "exact-engineering-id" : "product-name";
}


