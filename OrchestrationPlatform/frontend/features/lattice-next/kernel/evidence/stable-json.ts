function normalized(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalized(item, seen));
  if (typeof value === "object") {
    if (seen.has(value)) throw new Error("Evidence payload contains a circular reference.");
    seen.add(value);
    const record = value as Record<string, unknown>;
    const output = Object.fromEntries(
      Object.keys(record).sort().flatMap((key) => {
        const current = record[key];
        return current === undefined || typeof current === "function" || typeof current === "symbol"
          ? []
          : [[key, normalized(current, seen)]];
      }),
    );
    seen.delete(value);
    return output;
  }
  return String(value);
}

export function stableJson(value: unknown): string {
  return JSON.stringify(normalized(value, new WeakSet<object>()));
}
