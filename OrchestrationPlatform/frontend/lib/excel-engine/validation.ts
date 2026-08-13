import type { ExcelIssueGroup, ExcelValidationIssue } from "@/types/excel-bom";

export function groupExcelIssues(issues: ExcelValidationIssue[]): ExcelIssueGroup[] {
  const groups = new Map<string, ExcelIssueGroup>();
  for (const issue of issues) {
    const key = `${issue.severity}|${issue.code}|${issue.message}`;
    const existing = groups.get(key);
    const row = issue.rowNumber;
    if (existing) {
      existing.count += 1;
      existing.affectedRows += issue.affectedRows ?? (row ? 1 : 0);
      if (row && existing.sampleRows.length < 5 && !existing.sampleRows.includes(row)) existing.sampleRows.push(row);
    } else {
      groups.set(key, {
        severity: issue.severity,
        code: issue.code,
        message: issue.message,
        count: 1,
        affectedRows: issue.affectedRows ?? (row ? 1 : 0),
        sampleRows: issue.sampleRows?.slice(0, 5) ?? (row ? [row] : []),
        suggestion: issue.suggestion,
      });
    }
  }
  const order = { error: 0, warning: 1, info: 2 } as const;
  return [...groups.values()].sort((a, b) => order[a.severity] - order[b.severity] || b.affectedRows - a.affectedRows);
}
