/**
 * CSV for spreadsheets an owner or their accountant will open in Excel.
 *
 * RFC 4180 quoting, CRLF rows, and a UTF-8 BOM so Excel reads ₱ and ñ as
 * UTF-8 instead of the system code page. A cell starting with = + - @ tab or
 * CR is prefixed with an apostrophe so a description such as "=HYPERLINK(...)"
 * stays text instead of becoming a live formula (CSV injection).
 */
export const CSV_BOM = "\uFEFF";

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | null | undefined): string {
  let text = value ?? "";
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(cells: Array<string | null | undefined>): string {
  return `${cells.map(csvCell).join(",")}\r\n`;
}

/**
 * Amounts are written raw, never through csvCell: they are already plain
 * decimal strings from the Decimal column, and a negative amount must stay a
 * number rather than gain the apostrophe that guards text cells.
 */
export function csvRowWithAmount(
  before: Array<string | null | undefined>,
  amount: string,
  after: Array<string | null | undefined>,
): string {
  if (!/^-?\d+\.\d{2}$/.test(amount)) throw new Error("csvRowWithAmount expects a fixed two-decimal string");
  return `${[...before.map(csvCell), amount, ...after.map(csvCell)].join(",")}\r\n`;
}
