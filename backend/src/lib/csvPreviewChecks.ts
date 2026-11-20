import { ApiError } from "./apiError";
import { detectDateFormat, looksLikeDate, type CsvDateFormat } from "./csvDates";
import { DETECTION_SAMPLE_ROWS } from "./recordTypeDetection";
import type { PreviewOptions } from "../services/csvImport.service";

/**
 * Finds the first date-shaped column and reads its convention.
 *
 * The preview runs BEFORE the owner maps any columns, so which column holds
 * the dates has to be inferred: a column counts when at least 80% of its
 * sampled non-empty cells are date-shaped, which tolerates the odd typo
 * without letting an amount column full of "12.05" masquerade as one (it
 * can't — the numeric date shape requires a 4-digit year).
 */
export function detectDateFormatFromRecords(records: Record<string, string>[]) {
  const sample = records.slice(0, DETECTION_SAMPLE_ROWS);
  const headers = records.length > 0 ? Object.keys(records[0]!) : [];
  for (const header of headers) {
    const values = sample.map((r) => (r[header] ?? "").trim()).filter(Boolean);
    if (values.length === 0) continue;
    const dateLike = values.filter(looksLikeDate);
    if (dateLike.length >= Math.ceil(values.length * 0.8)) {
      return detectDateFormat(values);
    }
  }
  return { format: "iso" as CsvDateFormat, ambiguous: false };
}

export function validateMapping(headers: string[], options: PreviewOptions): void {
  for (const header of Object.values(options.columnMapping)) {
    if (header && !headers.includes(header)) {
      throw new ApiError(400, "A mapped column is missing from this CSV. Check the column mapping and try again.");
    }
  }
  if (options.recordType === "mixed" && !options.mixedStrategy) {
    throw new ApiError(400, "Choose how this file identifies sales and expenses.");
  }
  if (options.recordType === "mixed" && options.mixedStrategy === "column" && !options.columnMapping.recordType) {
    throw new ApiError(400, "Choose the column that identifies sales and expenses.");
  }
}
