import type { ExcelNormalizationResult } from "@/types/excel-bom";

function download(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadExcelDiagnostics(result: ExcelNormalizationResult) {
  const base = result.source.fileName.replace(/\.xlsx$/i, "");
  download(`${base}-excel-import-diagnostics.json`, result.diagnostic);
}
