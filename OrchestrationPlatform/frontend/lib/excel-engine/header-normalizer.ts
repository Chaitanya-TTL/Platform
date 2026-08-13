import type { ExcelMappedField } from "@/types/excel-bom";

export const excelFields: ExcelMappedField[] = [
  "itemId", "parentItemId", "name", "quantity", "level", "revision", "unit", "path",
  "findNumber", "lineNumber", "referenceDesignator", "lifecycleState",
];

export const excelAliases: Record<ExcelMappedField, string[]> = {
  itemId: ["item id", "item number", "item no", "part number", "part no", "part id", "material", "material number", "material no", "component", "component id", "component number", "child item", "child part", "child number", "object number", "number"],
  parentItemId: ["parent item id", "parent item", "parent number", "parent no", "parent id", "parent part", "parent material", "assembly id", "assembly number", "parent"],
  name: ["name", "description", "item name", "part name", "component name", "item description", "part description", "component description", "material description", "nomenclature", "title"],
  quantity: ["quantity", "qty", "component quantity", "usage quantity", "required quantity", "amount", "count"],
  level: ["level", "structure level", "bom level", "indent level", "hierarchy level", "assembly level", "depth"],
  revision: ["revision", "rev", "version", "rev id", "item revision", "design revision"],
  unit: ["unit", "uom", "unit of measure", "base unit", "unit code"],
  path: ["path", "hierarchy path", "bom path", "structure path", "outline number", "wbs"],
  findNumber: ["find number", "find no", "find", "position", "position number", "item position"],
  lineNumber: ["line number", "line no", "line", "sequence", "sequence number"],
  referenceDesignator: ["reference designator", "ref des", "refdes", "reference", "designator"],
  lifecycleState: ["state", "lifecycle state", "status", "maturity", "release state"],
};

export function normalizeExcelHeader(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[_./\\-]+/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function tokenSimilarity(a: string, b: string) {
  const aa = new Set(normalizeExcelHeader(a).split(" ").filter(Boolean));
  const bb = new Set(normalizeExcelHeader(b).split(" ").filter(Boolean));
  if (!aa.size || !bb.size) return 0;
  const intersection = [...aa].filter((token) => bb.has(token)).length;
  return intersection / Math.max(aa.size, bb.size);
}
