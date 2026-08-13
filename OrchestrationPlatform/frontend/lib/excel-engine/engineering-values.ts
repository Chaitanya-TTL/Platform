import type { ParsedExcelQuantity } from "@/types/excel-bom";

export function cleanEngineeringId(value: string) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  const scientific = trimmed.match(/^([+-]?\d+(?:\.\d+)?)e\+?(\d+)$/i);
  if (!scientific) return trimmed;
  const [coefficient, exponentText] = [scientific[1], scientific[2]];
  const exponent = Number(exponentText);
  const [whole, fraction = ""] = coefficient.replace(/^\+/, "").split(".");
  if (exponent >= fraction.length) return `${whole}${fraction}${"0".repeat(exponent - fraction.length)}`;
  return `${whole}${fraction.slice(0, exponent)}.${fraction.slice(exponent)}`;
}

export function indentationDepth(value: string) {
  const prefix = String(value ?? "").match(/^[\s\u00a0]*/)?.[0] ?? "";
  const tabs = (prefix.match(/\t/g) ?? []).length;
  const spaces = prefix.replace(/\t/g, "").replace(/\u00a0/g, " ").length;
  return tabs + Math.floor(spaces / 2);
}

const UNIT_ALIASES: Record<string, string> = {
  ea: "EA", each: "EA", pcs: "PCS", pc: "PCS", piece: "PCS", pieces: "PCS",
  kg: "KG", g: "G", gram: "G", grams: "G", lb: "LB", lbs: "LB",
  l: "L", litre: "L", liter: "L", gallon: "GAL", gallons: "GAL", gal: "GAL",
  m: "M", mm: "MM", cm: "CM", ft: "FT", in: "IN", set: "SET", assy: "ASSY",
};

export function normalizeUnit(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return UNIT_ALIASES[raw.toLowerCase().replace(/\.$/, "")] ?? raw.toUpperCase();
}

export function parseEngineeringQuantity(value: string, explicitUnit = ""): ParsedExcelQuantity {
  const raw = String(value ?? "").trim();
  if (!raw) return { value: 1, unit: normalizeUnit(explicitUnit), qualifier: "", raw, defaulted: true, valid: true };
  if (/^(ar|a\/r|as required|reference|ref)$/i.test(raw)) {
    return { value: 1, unit: normalizeUnit(explicitUnit), qualifier: raw, raw, defaulted: false, valid: true };
  }
  const normalized = raw.replace(/\s+/g, " ").trim();
  const match = normalized.match(/^([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|[+-]?\.\d+)\s*(.*)$/);
  if (!match) return { value: 1, unit: normalizeUnit(explicitUnit), qualifier: raw, raw, defaulted: false, valid: false };
  const numeric = Number(match[1].replace(/,/g, ""));
  return {
    value: numeric,
    unit: normalizeUnit(explicitUnit || match[2]),
    qualifier: "",
    raw,
    defaulted: false,
    valid: Number.isFinite(numeric) && numeric >= 0,
  };
}

export function parseLevel(value: string) {
  const n = Number(String(value ?? "").trim());
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function pathDepth(value: string) {
  const cleaned = String(value ?? "").trim().replace(/^\.+|\.+$/g, "");
  if (!cleaned) return null;
  const parts = cleaned.split(/[.\/\\>-]+/).filter(Boolean);
  return parts.length ? Math.max(0, parts.length - 1) : null;
}
