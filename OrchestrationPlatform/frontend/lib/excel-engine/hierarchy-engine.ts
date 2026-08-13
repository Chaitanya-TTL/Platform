import type { TreeNodeData } from "@/types/bom-comparison";
import type { ExcelColumnMapping, ExcelHierarchyCandidate, ExcelNormalizedPreviewRow, ExcelValidationIssue, ExcelWorksheetData, ResolvedExcelHierarchyMode } from "@/types/excel-bom";
import { cleanEngineeringId, indentationDepth, parseEngineeringQuantity, parseLevel, pathDepth } from "@/lib/excel-engine/engineering-values";

export type PreparedExcelRow = ExcelNormalizedPreviewRow & {
  source: ExcelWorksheetData["rows"][number];
  attributes: Record<string, string | number | boolean>;
};

export function prepareRows(sheet: ExcelWorksheetData, mapping: ExcelColumnMapping) {
  const rows: PreparedExcelRow[] = [];
  for (const source of sheet.rows) {
    const rawItemId = mapping.itemId ? source.values[mapping.itemId] ?? "" : "";
    const itemId = cleanEngineeringId(rawItemId);
    if (!itemId) continue;
    const quantity = parseEngineeringQuantity(mapping.quantity ? source.values[mapping.quantity] ?? "" : "", mapping.unit ? source.values[mapping.unit] ?? "" : "");
    const revision = mapping.revision ? (source.values[mapping.revision] ?? "").trim() : "";
    const name = (mapping.name ? source.values[mapping.name] ?? "" : "").trim() || itemId;
    const explicitLevel = mapping.level ? parseLevel(source.values[mapping.level] ?? "") : null;
    const attributes: Record<string, string | number | boolean> = {
      "Item ID": itemId, Quantity: quantity.value, "Source Row": source.rowNumber, "Source Sheet": sheet.name,
    };
    if (quantity.unit) attributes.UOM = quantity.unit;
    if (quantity.qualifier) attributes["Quantity Qualifier"] = quantity.qualifier;
    if (quantity.raw) attributes["Raw Quantity"] = quantity.raw;
    if (revision) attributes.Revision = revision;
    if (mapping.findNumber && source.values[mapping.findNumber]?.trim()) attributes["Find Number"] = source.values[mapping.findNumber].trim();
    if (mapping.lineNumber && source.values[mapping.lineNumber]?.trim()) attributes["Line Number"] = source.values[mapping.lineNumber].trim();
    if (mapping.referenceDesignator && source.values[mapping.referenceDesignator]?.trim()) attributes["Reference Designator"] = source.values[mapping.referenceDesignator].trim();
    if (mapping.lifecycleState && source.values[mapping.lifecycleState]?.trim()) attributes["Lifecycle State"] = source.values[mapping.lifecycleState].trim();
    const mapped = new Set(Object.values(mapping).filter(Boolean));
    for (const [header, value] of Object.entries(source.values)) if (value.trim() && !mapped.has(header)) attributes[`Excel: ${header}`] = value.trim();
    const warnings: string[] = [];
    if (mapping.quantity && quantity.defaulted) warnings.push("Quantity defaulted to 1");
    if (mapping.quantity && !quantity.valid) warnings.push("Quantity could not be interpreted");
    rows.push({ source, rowNumber: source.rowNumber, rawItemId, itemId, name, level: explicitLevel, parentItemId: mapping.parentItemId ? cleanEngineeringId(source.values[mapping.parentItemId] ?? "") : "", quantity: quantity.value, unit: quantity.unit, rawQuantity: quantity.raw, revision, warnings, attributes });
  }
  return rows;
}

function candidate(mode: ResolvedExcelHierarchyMode, score: number, roots: number, depth: number, attached: number, orphans: number, jumps: number, evidence: string[]): ExcelHierarchyCandidate {
  return { mode, score: Math.max(0, Math.min(100, score)), confidence: score >= 80 ? "high" : score >= 55 ? "medium" : "low", rootCount: roots, maximumDepth: depth, attachedRows: attached, orphanRows: orphans, invalidJumps: jumps, evidence };
}

function levelStats(levels: Array<number | null>) {
  let roots = 0, jumps = 0, previous: number | null = null, maximum = 0;
  for (const level of levels) {
    if (level == null) continue;
    if (level === 0) roots += 1;
    if (previous != null && level > previous + 1) jumps += 1;
    previous = level; maximum = Math.max(maximum, level);
  }
  return { roots, jumps, maximum };
}

export function detectHierarchyCandidates(sheet: ExcelWorksheetData, mapping: ExcelColumnMapping, rows = prepareRows(sheet, mapping)) {
  const result: ExcelHierarchyCandidate[] = [];
  if (mapping.level) {
    const levels = rows.map((row) => row.level);
    const valid = levels.filter((level) => level != null).length;
    const stats = levelStats(levels);
    const score = 45 + (rows.length ? valid / rows.length : 0) * 38 + (stats.roots >= 1 ? 12 : 0) - stats.jumps * 8;
    result.push(candidate("level", score, stats.roots, stats.maximum, valid, rows.length - valid, stats.jumps, ["Explicit level column is mapped", `${valid} rows contain valid levels`, `${stats.roots} root level rows detected`]));
  }
  if (mapping.parentItemId) {
    const ids = new Set(rows.map((row) => row.itemId));
    const withParent = rows.filter((row) => row.parentItemId);
    const orphans = withParent.filter((row) => !ids.has(row.parentItemId)).length;
    const roots = rows.length - withParent.length;
    const score = 48 + (rows.length ? withParent.length / rows.length : 0) * 30 + (roots ? 10 : 0) - orphans * 2;
    result.push(candidate("parent-child", score, roots, 0, rows.length - orphans, orphans, 0, ["Parent Item ID column is mapped", `${withParent.length} rows declare a parent`, `${orphans} unmatched parent references`]));
  }
  if (mapping.itemId) {
    const depths = rows.map((row) => indentationDepth(row.rawItemId));
    const indented = depths.filter((depth) => depth > 0).length;
    if (indented) {
      const normalized = depths.map((depth) => depth ? Math.max(1, Math.round(depth / Math.max(1, Math.min(...depths.filter((item) => item > 0))))) : 0);
      const stats = levelStats(normalized);
      const score = 35 + indented / Math.max(1, rows.length) * 45 + (stats.jumps === 0 ? 12 : 0);
      result.push(candidate("indentation", score, stats.roots, stats.maximum, rows.length, 0, stats.jumps, ["Leading indentation is present in Item ID values", `${indented} rows contain indentation`]));
    }
  }
  if (mapping.path) {
    const depths = rows.map((row) => pathDepth(row.source.values[mapping.path] ?? ""));
    const valid = depths.filter((depth) => depth != null).length;
    const stats = levelStats(depths);
    result.push(candidate("path", 45 + valid / Math.max(1, rows.length) * 42 - stats.jumps * 5, stats.roots, stats.maximum, valid, rows.length - valid, stats.jumps, ["Hierarchy path column is mapped", `${valid} path values were parsed`]));
  }
  const levelColumns = sheet.headers.filter((header) => /^(level|lvl)\s*\d+$/i.test(header.trim()));
  if (levelColumns.length >= 2) result.push(candidate("level-columns", 82, 1, levelColumns.length - 1, rows.length, 0, 0, [`${levelColumns.length} separate level columns detected`]));
  result.push(candidate("flat", rows.length ? 35 : 0, rows.length ? 1 : 0, rows.length ? 1 : 0, rows.length, 0, 0, ["Safe fallback: first row as root and remaining rows as direct children"]));
  return result.sort((a, b) => b.score - a.score);
}

function node(row: PreparedExcelRow, id: string): TreeNodeData {
  return { id, name: row.name, attributes: row.attributes, children: [] };
}

function virtualRoot(roots: TreeNodeData[]) {
  return roots.length === 1 ? roots[0] : roots.length ? { id: "excel-virtual-root", name: "Excel BOM", attributes: { "Root count": roots.length, Virtual: true }, children: roots } : null;
}

function buildByLevels(rows: PreparedExcelRow[], levels: Array<number | null>, issues: ExcelValidationIssue[]) {
  const stack: Array<{ level: number; node: TreeNodeData }> = [];
  const roots: TreeNodeData[] = [];
  let previous = 0;
  rows.forEach((row, index) => {
    const level = levels[index];
    if (level == null) { issues.push({ severity: "error", code: "invalid-level", message: "Hierarchy level could not be interpreted.", rowNumber: row.rowNumber, itemId: row.itemId }); return; }
    if (stack.length && level > previous + 1) issues.push({ severity: "error", code: "level-jump", message: `Hierarchy jumps from level ${previous} to ${level}.`, rowNumber: row.rowNumber, itemId: row.itemId });
    const current = node(row, `excel-${row.rowNumber}-${index}-${row.itemId}`);
    while (stack.length && stack.at(-1)!.level >= level) stack.pop();
    if (!stack.length) roots.push(current); else stack.at(-1)!.node.children!.push(current);
    stack.push({ level, node: current }); previous = level;
  });
  return virtualRoot(roots);
}

function buildParentChild(rows: PreparedExcelRow[], issues: ExcelValidationIssue[]) {
  const children = new Map<string, PreparedExcelRow[]>();
  const defined = new Set(rows.map((row) => row.itemId));
  for (const row of rows) {
    const list = children.get(row.parentItemId) ?? []; list.push(row); children.set(row.parentItemId, list);
    if (row.parentItemId === row.itemId) issues.push({ severity: "error", code: "self-parent", message: "An item cannot be its own parent.", rowNumber: row.rowNumber, itemId: row.itemId });
  }
  const roots = rows.filter((row) => !row.parentItemId || !defined.has(row.parentItemId));
  const visiting = new Set<number>();
  const build = (row: PreparedExcelRow, path: string): TreeNodeData => {
    if (visiting.has(row.rowNumber)) { issues.push({ severity: "error", code: "cycle", message: "Circular parent relationship detected.", rowNumber: row.rowNumber, itemId: row.itemId }); return node(row, `${path}-cycle`); }
    visiting.add(row.rowNumber);
    const current = node(row, `${path}-${row.rowNumber}-${row.itemId}`);
    current.children = (children.get(row.itemId) ?? []).filter((child) => child.rowNumber !== row.rowNumber).map((child, index) => build(child, `${path}-${index}`));
    visiting.delete(row.rowNumber); return current;
  };
  return virtualRoot(roots.map((row, index) => build(row, `excel-root-${index}`)));
}

function buildLevelColumns(sheet: ExcelWorksheetData, mapping: ExcelColumnMapping, issues: ExcelValidationIssue[]) {
  const columns = sheet.headers.filter((header) => /^(level|lvl)\s*\d+$/i.test(header.trim())).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  const synthetic: PreparedExcelRow[] = [];
  const levels: number[] = [];
  for (const source of sheet.rows) {
    const index = columns.findIndex((header) => source.values[header]?.trim());
    if (index < 0) continue;
    const raw = source.values[columns[index]];
    const itemId = cleanEngineeringId(raw);
    synthetic.push({ source, rowNumber: source.rowNumber, rawItemId: raw, itemId, name: itemId, level: index, parentItemId: "", quantity: 1, unit: "", rawQuantity: "", revision: "", warnings: [], attributes: { "Item ID": itemId, "Source Row": source.rowNumber, "Source Sheet": sheet.name, Quantity: 1 } });
    levels.push(index);
  }
  return buildByLevels(synthetic, levels, issues);
}

export function buildExcelHierarchy(sheet: ExcelWorksheetData, mapping: ExcelColumnMapping, requested: ResolvedExcelHierarchyMode, issues: ExcelValidationIssue[], rows = prepareRows(sheet, mapping)) {
  if (requested === "level") return buildByLevels(rows, rows.map((row) => row.level), issues);
  if (requested === "parent-child") return buildParentChild(rows, issues);
  if (requested === "indentation") {
    const rawDepths = rows.map((row) => indentationDepth(row.rawItemId));
    const positives = rawDepths.filter((depth) => depth > 0);
    const step = positives.length ? Math.max(1, Math.min(...positives)) : 1;
    return buildByLevels(rows, rawDepths.map((depth) => depth ? Math.max(1, Math.round(depth / step)) : 0), issues);
  }
  if (requested === "path") return buildByLevels(rows, rows.map((row) => pathDepth(row.source.values[mapping.path] ?? "")), issues);
  if (requested === "level-columns") return buildLevelColumns(sheet, mapping, issues);
  const first = rows[0];
  if (!first) return null;
  const root = node(first, `excel-${first.rowNumber}-root`);
  root.children = rows.slice(1).map((row, index) => node(row, `excel-${row.rowNumber}-${index}`));
  return root;
}
