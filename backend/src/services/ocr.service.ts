import { createWorker } from "tesseract.js";
import { env } from "../config/env";

export async function extractText(buffer: Buffer): Promise<string> {
  const worker = await createWorker(env.TESSERACT_LANG);
  try {
    const { data } = await worker.recognize(buffer);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

export interface ParsedReceiptFields {
  date: string | null; // YYYY-MM-DD
  vendor: string | null;
  description: string | null;
  amount: number | null;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// Receipt OCR is inherently noisy — these are best-effort heuristics
// producing a first guess for a human to correct, not a reliable parser.
// See tests/ocr-accuracy/OCR-ACCURACY-REPORT.md for measured accuracy against
// a 20-image corpus, including the failure patterns that shaped the rules
// below.

/**
 * Returns the date only if it is a real calendar date.
 *
 * This guard exists because of a real defect: a DD/MM/YYYY receipt dated after
 * the 12th (e.g. "25/07/2026") was emitted as "2026-25-07" — month 25. That
 * string becomes an Invalid Date, which Prisma rejects with a validation error,
 * so the ENTIRE receipt upload failed with a 500 instead of saving a scan the
 * owner could correct by hand. Never emit a date that cannot exist.
 */
function isoIfValid(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Round-trip check catches e.g. 31 February, which Date silently rolls over.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Lines carrying dates that are NOT the transaction date. Philippine POS
// receipts print several of these (BIR permit issue dates, accreditation
// validity, "valid until"), and they usually appear ABOVE the transaction date
// — so a first-match-wins scan reads the wrong one. Measured: a real receipt
// returned 2024-10-14 from its "PTU Issued" line.
const ADMINISTRATIVE_LINE =
  /\b(ptu|permit|accredit|valid\s+until|valid\s*:|vat\s+reg|tin\s*[:#]|pos\s+sn|serial|min\s*[:#]|date\s+issue[d]?)\b/i;

function transactionLines(text: string): string[] {
  return text.split("\n").filter((line) => !ADMINISTRATIVE_LINE.test(line));
}

function findDateInText(text: string): string | null {
  const isoMatch = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const iso = isoIfValid(Number(y), Number(m), Number(d));
    if (iso) return iso;
  }

  const monthNameMatch = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i
  );
  if (monthNameMatch) {
    const [, mon, d, y] = monthNameMatch;
    const iso = isoIfValid(Number(y), Number(MONTHS[mon!.toLowerCase()]), Number(d));
    if (iso) return iso;
  }

  // Numeric slash/dash dates are locale-ambiguous. Resolve by validity first,
  // then by locale:
  //   - second > 12 -> the second component can only be the day, so MM/DD
  //   - first > 12  -> the first can only be the day, so DD/MM
  //   - both <= 12  -> genuinely ambiguous; assume DD/MM
  //
  // DD/MM is the Philippine convention and this app's target market. The
  // previous MM/DD default was measured getting a real Cebu receipt exactly
  // wrong: "11/07/2026" (11 July) was read as 7 November. The cost of this
  // choice is that a US-format receipt is now misread instead — unavoidable
  // without a locale setting, and the wrong way round for these users. The
  // confirm screen is where the owner corrects either case.
  const slashMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (slashMatch) {
    const [, aRaw, bRaw, yRaw] = slashMatch;
    const a = Number(aRaw);
    const b = Number(bRaw);
    const year = yRaw!.length === 2 ? Number(`20${yRaw}`) : Number(yRaw);
    return b > 12 ? isoIfValid(year, a, b) : isoIfValid(year, b, a);
  }

  return null;
}

function parseDate(text: string): string | null {
  // Prefer a date from the receipt's own transaction lines; only fall back to
  // the full text (administrative lines included) if that finds nothing, since
  // a wrong-but-plausible date still beats no date for the owner to correct.
  return findDateInText(transactionLines(text).join("\n")) ?? findDateInText(text);
}

function parseAmount(text: string): number | null {
  const lines = text.split("\n");
  // \d{1,3} on its own before the optional comma groups would truncate a
  // plain 4+ digit total with no thousands separator (e.g. "1220.00"
  // matched as "220.00") — confirmed against a real test receipt. \d+
  // greedily consumes the whole integer part first.
  const moneyPattern = /(\d+(?:,\d{3})*\.\d{2})/;

  const totalLine = lines.find((line) => /\btotal\b/i.test(line) && !/subtotal/i.test(line));
  if (totalLine) {
    const match = totalLine.match(moneyPattern);
    if (match) return Number(match[1]!.replace(/,/g, ""));
  }

  // Fall back to the largest decimal-looking number anywhere in the
  // receipt — usually the total is the biggest line-item-shaped number.
  const allMatches = [...text.matchAll(new RegExp(moneyPattern, "g"))].map((m) => Number(m[1]!.replace(/,/g, "")));
  if (allMatches.length > 0) {
    return Math.max(...allMatches);
  }

  return null;
}

// Generic document furniture that is never the store's name.
const NOT_A_VENDOR =
  /^[\W_]*(sales\s+invoice|official\s+receipt|invoice|receipt|cash\s+invoice|statement|order\s+slip)[\W_]*$/i;

/**
 * Best guess at the store name: the first substantive line.
 *
 * KNOWN LIMITATION, measured and not fixed here: this assumes the vendor is at
 * the TOP. Receipts that print the store name in a footer are read wrong, and
 * no cheap heuristic distinguishes a footer store name from a "thank you"
 * line. See the accuracy report — it is the largest remaining vendor failure
 * class. The confirm screen is where the owner corrects it.
 */
function parseVendor(text: string): string | null {
  const candidates = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 1 && /[a-zA-Z]/.test(l))
    // Skip registration/permit blocks, which many PH receipts print above the
    // store name, and skip bare "SALES INVOICE"-style headers.
    .filter((l) => !ADMINISTRATIVE_LINE.test(l))
    .filter((l) => !NOT_A_VENDOR.test(l.replace(/[*=~-]/g, " ").trim()))
    // A line that is mostly digits/punctuation is a reference number, not a name.
    .filter((l) => {
      const letters = (l.match(/[a-zA-Z]/g) ?? []).length;
      return letters >= 3 && letters / l.replace(/\s/g, "").length > 0.4;
    });

  return candidates[0] ?? text.split("\n").map((l) => l.trim()).find((l) => l.length > 1 && /[a-zA-Z]/.test(l)) ?? null;
}

export function parseReceiptFields(text: string): ParsedReceiptFields {
  const vendor = parseVendor(text);
  return {
    date: parseDate(text),
    vendor,
    description: vendor ? `Purchase from ${vendor}` : "Receipt purchase",
    amount: parseAmount(text),
  };
}
