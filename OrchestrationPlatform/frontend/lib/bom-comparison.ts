import type {
  BomComparisonResult,
  ComparisonField,
  ComparisonReasoning,
  ComparisonSummary,
  FieldDifference,
  MatchReason,
  MultiBomComparisonResult,
  NodeComparison,
  NormalizedBomNode,
  SourceType,
  TreeNodeData,
} from "@/types/bom-comparison";
const STOP = new Set(["view", "assembly", "assy", "product", "bom"]);
function primitive(v: unknown) {
  return typeof v === "string" && v.trim()
    ? v.trim()
    : typeof v === "number" || typeof v === "boolean"
      ? String(v)
      : undefined;
}
function attr(n: TreeNodeData, keys: string[]) {
  for (const k of keys) {
    const v = primitive(n.attributes?.[k]);
    if (v) return v;
  }
  return undefined;
}
export function sourcePresentation(n: TreeNodeData, s: SourceType) {
  const quantity = attr(n, ["Qty", "Quantity"]),
    revision = attr(n, ["Rev ID", "Revision"]);
  if (s === "teamcenter") {
    const itemId = attr(n, ["Item ID"]),
      m = n.name.trim().match(/^[^;]+;\d+-(.*?)(?:\s+x\s+[\d.]+)?$/i);
    return {
      name: m?.[1]?.trim() || n.name.trim(),
      itemId,
      quantity,
      revision,
    };
  }
  if (s === "configit") {
    const productId = attr(n, ["Product ID"]),
      raw = productId || n.name.trim().replace(/^Product\s+/i, ""),
      m = raw.match(/^(.*)_([A-Za-z0-9]+)$/);
    return {
      name: m?.[1]?.trim() || raw.trim(),
      itemId: m?.[2] || productId,
      quantity,
      revision,
    };
  }
  if (s === "excel") {
    return {
      name: n.name.trim(),
      itemId: attr(n, ["Item ID"]),
      quantity,
      revision,
    };
  }
  return {
    name: n.name.trim(),
    itemId: n.id.trim().match(/-([A-Za-z0-9]+)$/)?.[1],
    quantity,
    revision,
  };
}
export function normalizeName(v: string) {
  return v
    .toLowerCase()
    .replace(/\([^)]*view[^)]*\)/gi, " ")
    .replace(/[_/;:,.()[\]{}-]+/g, " ")
    .replace(/\b(rev(?:ision)?|version)\s*[a-z0-9.]+\b/gi, " ")
    .replace(/\bx\s*\d+(?:\.\d+)?\b/gi, " ")
    .split(/\s+/)
    .filter((x) => x && !STOP.has(x))
    .join(" ")
    .trim();
}
function qty(v?: string) {
  if (!v) return undefined;
  const m = v.replace(/,/g, ".").match(/-?\d+(?:\.\d+)?/);
  return m ? String(Number(m[0])) : v.trim().toLowerCase();
}
function flatten(root: TreeNodeData, source: SourceType) {
  const out: NormalizedBomNode[] = [];
  const walk = (n: TreeNodeData, level: number, parent?: NormalizedBomNode) => {
    const p = sourcePresentation(n, source),
      x: NormalizedBomNode = {
        source,
        nodeId: n.id,
        itemId: p.itemId?.toLowerCase(),
        name: p.name,
        normalizedName: normalizeName(p.name),
        quantity: qty(p.quantity),
        revision: p.revision?.toLowerCase(),
        parentName: parent?.name,
        normalizedParentName: parent?.normalizedName,
        level,
        childCount: n.children?.length ?? 0,
      };
    out.push(x);
    for (const c of n.children ?? []) walk(c, level + 1, x);
  };
  walk(root, 0);
  return out;
}
function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const x = new Set(a.split(" ")),
    y = new Set(b.split(" ")),
    i = [...x].filter((t) => y.has(t)).length,
    u = new Set([...x, ...y]).size;
  return u ? i / u : 0;
}
function score(a: NormalizedBomNode, b: NormalizedBomNode) {
  let s = similarity(a.normalizedName, b.normalizedName) * 0.72;
  if (a.normalizedParentName && b.normalizedParentName)
    s += similarity(a.normalizedParentName, b.normalizedParentName) * 0.15;
  if (a.level === b.level) s += 0.07;
  if (a.childCount > 0 === b.childCount > 0) s += 0.06;
  return Math.min(1, s);
}
function differences(a: NormalizedBomNode, b: NormalizedBomNode) {
  const d: FieldDifference[] = [];
  if (a.normalizedName !== b.normalizedName)
    d.push({ field: "name", left: a.name, right: b.name });
  if (a.quantity && b.quantity && a.quantity !== b.quantity)
    d.push({ field: "quantity", left: a.quantity, right: b.quantity });
  if (a.revision && b.revision && a.revision !== b.revision)
    d.push({ field: "revision", left: a.revision, right: b.revision });
  if (
    a.normalizedParentName &&
    b.normalizedParentName &&
    a.normalizedParentName !== b.normalizedParentName
  )
    d.push({ field: "parent", left: a.parentName, right: b.parentName });
  return d;
}
function explain(
  a: NormalizedBomNode,
  b: NormalizedBomNode | undefined,
  reason: MatchReason,
  confidence: number,
  d: FieldDifference[],
  only = false,
): ComparisonReasoning {
  if (!b)
    return {
      summary: only
        ? "This item exists only in this source."
        : "No counterpart was found in the compared source.",
      details: [
        a.itemId
          ? `No unused node with Item ID ${a.itemId} was found.`
          : "No comparable business Item ID was available.",
        `No name-and-structure candidate reached the 62% matching threshold for “${a.name}”.`,
      ],
      matchedFields: [],
      differentFields: [],
    };
  const details: string[] = [],
    matched: ComparisonField[] = [],
    different = d.map((x) => x.field) as ComparisonField[];
  if (reason === "item-id") {
    details.push(`Exact Item ID match: ${a.itemId}.`);
    matched.push("itemId");
  } else
    details.push(
      "Item IDs differ; name and hierarchy context selected the counterpart.",
    );
  if (a.normalizedName === b.normalizedName) {
    details.push(`Normalized name matches: “${a.normalizedName || a.name}”.`);
    matched.push("name");
  } else details.push(`Names differ: “${a.name}” versus “${b.name}”.`);
  if (a.normalizedParentName && b.normalizedParentName) {
    if (a.normalizedParentName === b.normalizedParentName) {
      details.push(`Parent assembly matches: “${a.parentName}”.`);
      matched.push("parent");
    } else
      details.push(
        `Parent assembly differs: “${a.parentName}” versus “${b.parentName}”.`,
      );
  } else
    details.push(
      "Parent context was unavailable on one side and was not treated as a mismatch.",
    );
  if (a.level === b.level) {
    details.push(`Hierarchy level matches: level ${a.level + 1}.`);
    matched.push("level");
  } else {
    details.push(
      `Hierarchy level differs: ${a.level + 1} versus ${b.level + 1}.`,
    );
    different.push("level");
  }
  if (a.childCount > 0 === b.childCount > 0) {
    details.push(
      a.childCount > 0
        ? "Both lines are assemblies."
        : "Both lines are leaf components.",
    );
    matched.push("nodeType");
  } else {
    details.push("One line is an assembly and the other is a leaf component.");
    different.push("nodeType");
  }
  if (a.quantity && b.quantity) {
    if (a.quantity === b.quantity) {
      details.push(`Quantity matches: ${a.quantity}.`);
      matched.push("quantity");
    } else
      details.push(`Quantity differs: ${a.quantity} versus ${b.quantity}.`);
  } else
    details.push(
      "Quantity was missing on one side and was not treated as a mismatch.",
    );
  const pct = Math.round(confidence * 100),
    summary = d.length
      ? `Counterpart found with ${pct}% confidence, but ${d.length} comparable field${d.length === 1 ? "" : "s"} differ.`
      : reason === "name"
        ? `Probable counterpart found with ${pct}% confidence; manual review is recommended.`
        : `Counterpart matched with ${pct}% confidence and no comparable values differ.`;
  return {
    summary,
    details,
    matchedFields: matched,
    differentFields: [...new Set(different)],
  };
}
export function isValidComparisonPair(
  a: SourceType,
  b: SourceType,
  roots: Partial<Record<SourceType, TreeNodeData>>,
) {
  return a !== b && Boolean(roots[a]) && Boolean(roots[b]);
}
export function compareBoms(
  leftRoot: TreeNodeData,
  leftSource: SourceType,
  rightRoot: TreeNodeData,
  rightSource: SourceType,
): BomComparisonResult {
  const A = flatten(leftRoot, leftSource),
    B = flatten(rightRoot, rightSource),
    left: Record<string, NodeComparison> = {},
    right: Record<string, NodeComparison> = {},
    used = new Set<string>(),
    byId = new Map<string, NormalizedBomNode[]>();
  for (const n of B)
    if (n.itemId) byId.set(n.itemId, [...(byId.get(n.itemId) ?? []), n]);
  for (const a of A) {
    let b: NormalizedBomNode | undefined,
      confidence = 0,
      reason: MatchReason = "none";
    if (a.itemId) {
      b = byId.get(a.itemId)?.find((x) => !used.has(x.nodeId));
      if (b) {
        confidence = 1;
        reason = "item-id";
      }
    }
    if (!b) {
      const ranked = B.filter((x) => !used.has(x.nodeId))
        .map((node) => ({ node, score: score(a, node) }))
        .sort((x, y) => y.score - x.score);
      if (ranked[0]?.score >= 0.62) {
        b = ranked[0].node;
        confidence = ranked[0].score;
        reason = confidence >= 0.86 ? "name-context" : "name";
      }
    }
    if (!b) {
      left[a.nodeId] = {
        status: "missing",
        nodeId: a.nodeId,
        confidence: 0,
        matchReason: "none",
        differences: [],
        reasoning: explain(a, undefined, "none", 0, []),
      };
      continue;
    }
    used.add(b.nodeId);
    const d = differences(a, b),
      status =
        reason === "name" || confidence < 0.78
          ? "probable"
          : d.length
            ? "changed"
            : "matched",
      reasoning = explain(a, b, reason, confidence, d);
    left[a.nodeId] = {
      status,
      nodeId: a.nodeId,
      counterpartNodeId: b.nodeId,
      counterpartSource: rightSource,
      confidence,
      matchReason: reason,
      differences: d,
      reasoning,
    };
    right[b.nodeId] = {
      status,
      nodeId: b.nodeId,
      counterpartNodeId: a.nodeId,
      counterpartSource: leftSource,
      confidence,
      matchReason: reason,
      differences: d.map((x) => ({ ...x, left: x.right, right: x.left })),
      reasoning,
    };
  }
  for (const b of B)
    if (!right[b.nodeId])
      right[b.nodeId] = {
        status: "source-only",
        nodeId: b.nodeId,
        confidence: 0,
        matchReason: "none",
        differences: [],
        reasoning: explain(b, undefined, "none", 0, [], true),
      };
  const summary: ComparisonSummary = {
    matched: 0,
    changed: 0,
    missing: 0,
    sourceOnly: 0,
    probable: 0,
    total: A.length,
  };
  for (const x of Object.values(left)) {
    if (x.status === "matched") summary.matched++;
    if (x.status === "changed") summary.changed++;
    if (x.status === "missing") summary.missing++;
    if (x.status === "probable") summary.probable++;
  }
  summary.sourceOnly = Object.values(right).filter(
    (x) => x.status === "source-only",
  ).length;
  return {
    leftSource,
    rightSource,
    left,
    right,
    summary,
    generatedAt: new Date().toISOString(),
  };
}
const rank: Record<NodeComparison["status"], number> = {
  matched: 0,
  probable: 1,
  changed: 2,
  missing: 3,
  "source-only": 3,
};
function aggregatePrimary(
  primary: SourceType,
  pairs: BomComparisonResult[],
  labels: Record<SourceType, string>,
) {
  const ids = new Set(pairs.flatMap((p) => Object.keys(p.left))),
    out: Record<string, NodeComparison> = {};
  for (const id of ids) {
    const entries = pairs
      .map((p) => ({ source: p.rightSource, value: p.left[id] }))
      .filter((x) => x.value);
    if (!entries.length) continue;
    const worst = [...entries].sort(
      (a, b) => rank[b.value.status] - rank[a.value.status],
    )[0].value;
    const details = entries.flatMap(({ source, value }) => [
      `Against ${labels[source]}: ${value.reasoning.summary}`,
      ...value.reasoning.details.slice(0, 2).map((x) => `• ${x}`),
    ]);
    out[id] = {
      ...worst,
      nodeId: id,
      counterpartSource: undefined,
      counterpartNodeId: undefined,
      reasoning: {
        summary: entries.every((x) => x.value.status === "matched")
          ? `Matched across all ${entries.length} compared sources.`
          : `Combined result across ${entries.length} compared sources. The most significant status is ${worst.status}.`,
        details,
        matchedFields: [
          ...new Set(entries.flatMap((x) => x.value.reasoning.matchedFields)),
        ],
        differentFields: [
          ...new Set(entries.flatMap((x) => x.value.reasoning.differentFields)),
        ],
      },
    };
  }
  return out;
}
export function compareMultipleBoms(
  primarySource: SourceType,
  comparedSources: SourceType[],
  roots: Partial<Record<SourceType, TreeNodeData>>,
  labels: Record<SourceType, string>,
): MultiBomComparisonResult | null {
  const primary = roots[primarySource];
  if (!primary || !comparedSources.length) return null;
  const pairs = comparedSources
    .filter((s) => roots[s])
    .map((s) => compareBoms(primary, primarySource, roots[s]!, s));
  if (!pairs.length) return null;
  const maps: Partial<Record<SourceType, Record<string, NodeComparison>>> = {
    [primarySource]: aggregatePrimary(primarySource, pairs, labels),
  };
  for (const pair of pairs) maps[pair.rightSource] = pair.right;
  const summary: ComparisonSummary = {
    matched: 0,
    changed: 0,
    missing: 0,
    sourceOnly: 0,
    probable: 0,
    total: 0,
  };
  for (const pair of pairs) {
    summary.matched += pair.summary.matched;
    summary.changed += pair.summary.changed;
    summary.missing += pair.summary.missing;
    summary.sourceOnly += pair.summary.sourceOnly;
    summary.probable += pair.summary.probable;
    summary.total += pair.summary.total;
  }
  return {
    primarySource,
    comparedSources: pairs.map((p) => p.rightSource),
    pairResults: pairs,
    maps,
    summary,
    generatedAt: new Date().toISOString(),
  };
}
export function downloadMultiComparison(
  result: MultiBomComparisonResult,
  format: "json" | "csv",
) {
  let content: string, mime: string, ext: string;
  if (format === "json") {
    content = JSON.stringify(result, null, 2);
    mime = "application/json";
    ext = "json";
  } else {
    const rows = [
      [
        "comparison",
        "source",
        "nodeId",
        "status",
        "counterpartNodeId",
        "confidence",
        "summary",
        "details",
      ],
    ];
    for (const pair of result.pairResults)
      for (const [source, values] of [
        [pair.leftSource, pair.left],
        [pair.rightSource, pair.right],
      ] as Array<[SourceType, Record<string, NodeComparison>]>)
        for (const x of Object.values(values))
          rows.push([
            `${pair.leftSource}-vs-${pair.rightSource}`,
            source,
            x.nodeId,
            x.status,
            x.counterpartNodeId ?? "",
            x.confidence.toFixed(2),
            x.reasoning.summary,
            x.reasoning.details.join(" | "),
          ]);
    content = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    mime = "text/csv";
    ext = "csv";
  }
  const url = URL.createObjectURL(new Blob([content], { type: mime })),
    a = document.createElement("a");
  a.href = url;
  a.download = `multi-bom-comparison-${result.primarySource}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}
