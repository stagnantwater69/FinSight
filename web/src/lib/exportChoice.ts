/**
 * Kept identical to mobile/src/lib/exportChoice.ts. What the export panel turns a choice into: which months, how many records,
 * and the request and file name to send. Plain functions so the date maths is
 * tested without rendering the sheet.
 */

export type ExportType = "all" | "expense" | "sales";
export type ExportMode = "filtered" | "thisMonth" | "lastMonth" | "thisQuarter" | "thisYear" | "lastYear" | "months" | "range" | "everything";
export interface ExportMonth { month: string; expenses: number; sales: number }

/** The most rows one file may hold; matches MAX_EXPORT_ROWS on the server. */
export const MAX_EXPORT_ROWS = 1_000_000;

const pad = (n: number) => String(n).padStart(2, "0");
const key = (year: number, month: number) => `${year}-${pad(month)}`;
function span(year: number, from: number, to: number): string[] {
  return Array.from({ length: to - from + 1 }, (_, i) => key(year, from + i));
}

/** The months a quick pick covers, from the business's today ("YYYY-MM-DD"). Null for modes that are not month lists. */
export function presetMonths(mode: ExportMode, today: string): string[] | null {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  switch (mode) {
    case "thisMonth": return [key(year, month)];
    case "lastMonth": return month === 1 ? [key(year - 1, 12)] : [key(year, month - 1)];
    case "thisQuarter": return span(year, Math.floor((month - 1) / 3) * 3 + 1, month);
    case "thisYear": return span(year, 1, month);
    case "lastYear": return span(year - 1, 1, 12);
    default: return null;
  }
}

/** How many records `months` hold for `type`; every month when `months` is null. */
export function countFor(counts: readonly ExportMonth[], months: readonly string[] | null, type: ExportType): number {
  const wanted = months ? new Set(months) : null;
  return counts.reduce((sum, row) => !wanted || wanted.has(row.month)
    ? sum + (type === "sales" ? 0 : row.expenses) + (type === "expense" ? 0 : row.sales)
    : sum, 0);
}

/** The request and file name for a month list, a date range, or everything. */
export function exportRequest(businessProfileId: number, type: ExportType, scope: { months: readonly string[] } | { dateFrom: string; dateTo: string } | null): {
  query: Record<string, string | number>;
  name: string;
} {
  const kind = type === "all" ? "records" : type;
  const query: Record<string, string | number> = { businessProfileId, type };
  if (!scope) return { query, name: `finsight-all-${kind}` };
  if ("months" in scope) {
    const sorted = [...scope.months].sort();
    query.months = sorted.join(",");
    return { query, name: `finsight-${kind}-${sorted[0]}${sorted.length > 1 ? `-to-${sorted.at(-1)}` : ""}` };
  }
  query.dateFrom = scope.dateFrom;
  query.dateTo = scope.dateTo;
  return { query, name: `finsight-${kind}-${scope.dateFrom}-to-${scope.dateTo}` };
}
