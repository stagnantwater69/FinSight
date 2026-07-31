import { createWorker } from "tesseract.js";
import sharp from "sharp";
import { env } from "../config/env";

/**
 * The width a receipt photo is reduced to before OCR.
 *
 * Only ever DOWN. A modern phone camera produces a 3000-4000px image of a
 * receipt whose text is maybe 300px wide, and tesseract does not read that
 * any better for the extra pixels — it just spends longer. Upscaling is
 * deliberately not done either: enlarging a blurry capture invents no
 * detail, it only makes the blur bigger.
 */
const MAX_WIDTH = 2000;

/**
 * Prepares a photo for tesseract.
 *
 * THIS IS NOT AN ACCURACY IMPROVEMENT, and the comment says so because the
 * obvious assumption is that it must be. Measured against the 30-image
 * corpus, these three operations together score EXACTLY the same as feeding
 * tesseract the raw bytes — same date, vendor, amount and item figures, image
 * for image. What they buy is orientation correctness and a smaller image to
 * work on, not better reading.
 *
 * What each one is here for:
 *   - `rotate()` with no argument applies the EXIF orientation flag a phone
 *     camera writes. This is the one with a real correctness case behind it:
 *     a receipt photographed in portrait and tagged sideways is unreadable
 *     otherwise. The corpus cannot demonstrate it, because none of its images
 *     carry an orientation flag.
 *   - the resize is a cost control. A modern phone sends a 3000-4000px image
 *     of a receipt whose text is a few hundred pixels wide; tesseract reads
 *     that no better and takes longer doing it. Capped, never enlarged.
 *   - `grayscale()` discards colour tesseract does not use.
 *
 * WHAT WAS TRIED AND REJECTED, so it is not retried on the same assumption:
 *
 *   - `normalize()` (global contrast stretch) — MEASURED REGRESSION. On the
 *     real crumpled thermal photo in the corpus it turned the 188.00 total
 *     into 8 and the year 2026 into 2028: stretching the whole frame on a
 *     bright table background pushes the faint thermal strokes out, and a
 *     leading "1" is exactly what goes first. Date and amount both fell from
 *     100% to 97%.
 *   - `.clahe()` (genuinely local, adaptive contrast — the technique that
 *     uneven lighting actually calls for) at window sizes 3 through 100 —
 *     neutral at best, and worse at small windows, where it destroyed the
 *     date and amount entirely.
 *   - median denoise, 2x upscaling, and sharpening — neutral or worse.
 *
 * None of them recovered the two line items lost on that photo. That failure
 * is not a contrast problem: tesseract returns the item block as
 * "Spareribs Keal Res FLV", with no legible amount anywhere in it. There is
 * no image transform that puts back detail the capture did not record, and
 * this function does not pretend otherwise.
 */
async function preprocessReceiptImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .grayscale()
    .toBuffer();
}

/**
 * Tesseract engine knobs, for the accuracy harness to sweep.
 *
 * Production passes nothing and gets tesseract's defaults. This exists so
 * `tests/ocr-accuracy` can measure a page-segmentation change through the
 * exact same scoring path as everything else, rather than a re-implementation
 * of it that might score differently.
 */
export interface OcrEngineOptions {
  /** tesseract `tessedit_pageseg_mode`, e.g. "4" for a single column. */
  pageSegMode?: string;
  /** tesseract `user_defined_dpi`, for images carrying no DPI metadata. */
  dpi?: string;
}

export async function extractText(buffer: Buffer, options: OcrEngineOptions = {}): Promise<string> {
  /*
   * A preprocessing failure must not cost the owner their scan.
   *
   * sharp throws on anything it cannot decode, and the upload filter admits
   * whatever a browser labelled image/jpeg — which is not a guarantee the
   * bytes are a valid JPEG. Falling back to the original buffer means a file
   * sharp rejects gets exactly the treatment it used to get, rather than
   * turning a readable-but-odd image into a failed upload.
   */
  let image = buffer;
  try {
    image = await preprocessReceiptImage(buffer);
  } catch (err) {
    console.error("Receipt image preprocessing failed; reading the original image instead:", err);
  }

  const worker = await createWorker(env.TESSERACT_LANG);
  try {
    /*
     * DO NOT SET A PAGE SEGMENTATION MODE HERE. It has been measured, and
     * every alternative is worse.
     *
     * tesseract.js does not default to the tesseract CLI's PSM 3 — it
     * defaults to PSM 6 (assume a single uniform block), which happens to be
     * the best setting for receipts in this corpus. Setting PSM explicitly is
     * therefore all downside, and the "obvious" choice is the worst of the
     * lot: PSM 4 ("single column of variable-size text"), which reads like
     * the natural fit for a receipt, drops amount accuracy from 100% to 67%.
     * PSM 3 gives 63%, and the sparse-text modes 11/12 give 73%.
     *
     * Full sweep in tests/ocr-accuracy/OCR-ACCURACY-REPORT.md. A DPI hint is
     * neutral, so it is not set either.
     */
    const params: Record<string, string> = {};
    if (options.pageSegMode) params.tessedit_pageseg_mode = options.pageSegMode;
    if (options.dpi) params.user_defined_dpi = options.dpi;
    if (Object.keys(params).length > 0) await worker.setParameters(params);

    const { data } = await worker.recognize(image);
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

// ============================================================
// Line items — the individual things bought
// ============================================================
// Harder than date/vendor/amount, and honestly so. Those three are anchored:
// a date has a recognisable shape, a total sits next to the word TOTAL, a
// vendor is the first substantive line. An item line has no keyword to hang
// off — it is "some words, then some numbers" — and the layout varies by
// register: name and price only, name with a quantity column, a "2 x 25.00"
// prefix, a weight, a discount line indented underneath.
//
// So the rules below are conservative by design: anything that does not look
// unambiguously like a purchased line is dropped rather than guessed at. A
// missed item costs the owner one manual row; a fabricated item silently puts
// a number in their books that was never on the receipt. See the item-level
// figures in tests/ocr-accuracy/OCR-ACCURACY-REPORT.md for what that costs in
// recall.

export interface ParsedLineItem {
  name: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
}

/**
 * Lines that carry money but are not purchases.
 *
 * Getting this wrong is the expensive direction: admitting the TOTAL line as
 * an item would double the receipt, and admitting CHANGE would invent an
 * expense that is really money coming back.
 */
/**
 * `[VY]AT` rather than `VAT`, and similar loosenings throughout.
 *
 * Real receipts defeat exact-word denylists, because the word has already been
 * through OCR by the time this sees it. A Savemore Market receipt produced
 * "YAT Amount" for "VAT Amount" — V read as Y — and an exact `\bvat\b` let a
 * PHP 39.43 tax line through as a purchased item. Tolerating the handful of
 * confusions Tesseract actually makes on these specific words costs nothing:
 * no real product is called "YAT Amount".
 */
const NOT_AN_ITEM = new RegExp(
  [
    // Summary and total lines.
    String.raw`\b(sub\s*-?\s*total|total|amt|amount\s+due|amount\s+payable|balance)\b`,
    // Tax lines. [VY] for the V->Y misread; the trailing part covers
    // "VATable Sales", "VAT-Exempt Sales", "Zero-Rated Sales".
    String.raw`\b[vy]at(able)?\b`,
    String.raw`\b(tax|zero\s*-?\s*rated|vat\s*-?\s*exempt|exempt|non\s*-?\s*taxable)\b`,
    // Discounts and adjustments.
    String.raw`\b(discount|disc\.|less|senior|pwd|rebate|void|refund)\b`,
    // Payment-method and authorisation lines. These carry the receipt's own
    // total, so admitting one doubles the receipt — "BDO ATM 371.00" was
    // extracted as a PHP 371 purchase on the Savemore receipt.
    String.raw`\b(cash|change|tender|tendered|payment|paid|card|credit|debit|atm|charge|gcash|g-cash|maya|paymaya|grabpay|e-?wallet|bank|bdo|bpi|metrobank|unionbank|landbank|security\s*bank|rcbc|chinabank|visa|mastercard|amex)\b`,
    String.raw`\b(auth\s*-?\s*code|authcode|approval|approved|trace|batch|terminal|merchant|acct|account\s*(no|#)|order\s*id|ref(erence)?\s*(no|#)?)\b`,
    // Document furniture and register metadata. `bagger` is the packer's
    // name, printed on Philippine supermarket receipts right above the
    // total; `trans#` and `si#` are the transaction and sales-invoice
    // numbers. All three require the # so a two-letter token like "si"
    // cannot swallow a product name.
    String.raw`\b(invoice|receipt|thank|permit|tin|serial|pos\s+sn|min|date|time|cashier|customer|order|transaction|qty\s+item|item\s+qty|price|description|bagger)\b`,
    String.raw`\b(trans|si)\s*#`,
  ].join("|"),
  "i",
);

/**
 * A trailing money amount — the line's own total, at the right-hand edge.
 *
 * The optional trailing letter is a VAT classification flag, which Philippine
 * BIR-accredited registers print hard against the amount: "129.00V" (VATable),
 * "0.00Z" (zero-rated), "E" (exempt), "X" (non-taxable). Without it this
 * pattern misses every item line on a compliant PH receipt — found on
 * real-01-ph-pos-photo in the corpus, not hypothesised.
 */
const TRAILING_AMOUNT = /(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})\s*[VZEX]?\s*$/i;

/** A leading "2 x " / "2x" / "2 @ " quantity prefix. */
const LEADING_QUANTITY = /^\s*(\d+(?:\.\d+)?)\s*(?:x|@|pcs?|pc)\s+/i;

/**
 * A leading bare quantity column: "1 Americano". Common on US-style
 * registers that print QTY / DESC / AMT columns (real-02 in the corpus).
 *
 * Bounded to 3 digits deliberately, and that bound is what does the work:
 * "2026 Calendar 50.00" cannot match, because \d{1,3} can only take "202"
 * and the required whitespace then hits "6". A year at the start of a
 * product name is far more likely than a purchase of two thousand of
 * something. The bound also has to be the ONLY guard — requiring a
 * non-digit after it would drop "1 16oz Bottle Water", a real line from
 * real-02 in the corpus.
 */
const LEADING_BARE_QUANTITY = /^\s*(\d{1,3})\s+/;

/** A trailing "... 2 25.00 50.00" quantity + unit price + amount tail. */
const QTY_UNIT_AMOUNT_TAIL =
  /^(.*?)\s+(\d+(?:\.\d+)?)\s+(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})\s+(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})\s*$/;

function money(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

/**
 * A single decimal figure, tolerating OCR's comma-for-point.
 *
 * Distinct from `money` deliberately: there the comma is a thousands
 * separator and gets deleted, here it is the decimal point and gets
 * converted. Only ever called on a `\d+[.,]\d{2}` match, so there is exactly
 * one separator and no ambiguity between the two readings.
 */
function decimal(raw: string): number {
  return Number(raw.replace(",", "."));
}

/**
 * An inline unit price, printed between the item's name and the line total:
 * "3 Sprite Can 320ml @34.50   103.50".
 *
 * `[@8]` because Tesseract reads the @ as an 8 on thermal print — the real
 * Savemore line "5 Sey @22.95  114.75" came out of OCR as "5 Sey 822,95
 * 114.75", leaving "Sey 822,95" as the stored item name. Admitting the 8
 * form is only safe because of the multiply-out check at the call site: a
 * digit that is really the tail of a product code cannot pass it.
 */
const INLINE_UNIT_PRICE = /\s*([@8])\s*(\d+[.,]\d{2})\s*$/;

/**
 * Strips leading bullets/codes and collapses OCR's irregular spacing.
 *
 * The bracket substitution is cosmetic and can never move a number: it runs
 * on the name only, after the amount has already been taken off the line.
 * Tesseract reads a lowercase `l` as `]` on thermal print, which is why the
 * real receipt produced "FemmeTsu2P]y250" and "Sprite Can 320m]". Restoring
 * the letter inside a word is a better guess than dropping it, and a bracket
 * that is NOT inside a word is just noise, so it goes.
 */
function cleanItemName(raw: string): string {
  return raw
    .replace(/^[\s*·•\-–—|#]+/, "")
    .replace(/(?<=[A-Za-z0-9])\]/g, "l")
    .replace(/[[\]]/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[.\s]+$/, "")
    .trim();
}

/**
 * Reads the purchased lines off a receipt.
 *
 * Returns an empty array when the receipt has no parseable item lines at all
 * — a handwritten slip, or one that prints only a total. That is a real and
 * common case, and the caller falls back to the single-total flow rather than
 * inventing lines that were never legible.
 */
export function parseLineItems(text: string): ParsedLineItem[] {
  const items: ParsedLineItem[] = [];
  // The receipt's own total, used by the structural guard at the bottom.
  const receiptTotal = parseAmount(text);

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/₱|PHP|Php|\$/g, " ").trimEnd();
    if (!line.trim()) continue;
    // Administrative furniture and summary lines are never purchases.
    if (ADMINISTRATIVE_LINE.test(line) || NOT_AN_ITEM.test(line)) continue;

    // Shape A: "Name   2   25.00   50.00" — quantity and unit price columns.
    const columns = line.match(QTY_UNIT_AMOUNT_TAIL);
    if (columns) {
      const name = cleanItemName(columns[1]!);
      const quantity = Number(columns[2]);
      const unitPrice = money(columns[3]!);
      const amount = money(columns[4]!);
      // Only trust the columns when they actually multiply out; otherwise
      // this is three unrelated numbers that happen to sit in a row.
      if (name.length >= 2 && Math.abs(quantity * unitPrice - amount) < 0.02) {
        items.push({ name, quantity, unitPrice, amount });
        continue;
      }
    }

    // Shape B: "Name  50.00", optionally prefixed "2 x Name  50.00".
    const trailing = line.match(TRAILING_AMOUNT);
    if (!trailing) continue;
    const amount = money(trailing[1]!);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    let remainder = line.slice(0, line.length - trailing[0].length);
    let quantity: number | null = null;
    const qtyPrefix = remainder.match(LEADING_QUANTITY);
    if (qtyPrefix) {
      quantity = Number(qtyPrefix[1]);
      remainder = remainder.slice(qtyPrefix[0].length);
    } else {
      const bareQty = remainder.match(LEADING_BARE_QUANTITY);
      if (bareQty) {
        quantity = Number(bareQty[1]);
        remainder = remainder.slice(bareQty[0].length);
      }
    }

    /*
     * An inline "@34.50" unit price, when the register printed one.
     *
     * Trusted OVER the quantity column, and only when it multiplies out
     * against the line's own total — the same discipline Shape A applies to
     * its three columns. That check is what makes this a correction rather
     * than a second guess: on the real receipt, "8 fi Eogacre 130 @33.50
     * 100.50" was stored as 8 units at 12.56, because the leading 8 is a
     * misread and the true line is 3 at 33.50. The printed unit price is
     * the only thing on that line that can prove it, since 100.50 / 33.50
     * is exactly 3 and 8 x 33.50 is nowhere near the total.
     *
     * When the figures do NOT multiply out, the quantity column stands and
     * only a literal @ is stripped from the name — an 8 that failed the
     * check is more likely part of the product than a mangled @.
     */
    let unitPrice: number | null = null;
    const inline = remainder.match(INLINE_UNIT_PRICE);
    if (inline) {
      const candidate = decimal(inline[2]!);
      const impliedQuantity = candidate > 0 ? amount / candidate : 0;
      const rounded = Math.round(impliedQuantity);
      if (rounded >= 1 && Math.abs(impliedQuantity - rounded) < 0.005) {
        unitPrice = candidate;
        quantity = rounded;
        remainder = remainder.slice(0, remainder.length - inline[0].length);
      } else if (inline[1] === "@") {
        remainder = remainder.slice(0, remainder.length - inline[0].length);
      }
    }

    const name = cleanItemName(remainder);
    // A line that is all numbers has no name, so it is a column of figures
    // rather than a purchase. Two characters of letters is the floor.
    if ((name.match(/[a-zA-Z]/g) ?? []).length < 2) continue;

    items.push({
      name,
      quantity,
      unitPrice: unitPrice ?? (quantity && quantity > 0 ? Math.round((amount / quantity) * 100) / 100 : null),
      amount,
    });
  }

  /*
   * The structural guard, which no amount of OCR corruption can defeat.
   *
   * A payment line carries the receipt's total by definition — "BDO ATM
   * 371.00" on a receipt totalling 371.00. So on a receipt with several
   * items, a candidate whose amount EQUALS the total is a payment or summary
   * line however its name came out of OCR, and admitting it would roughly
   * double the receipt.
   *
   * Guarded by `length > 1`, because on a genuine one-item receipt the item
   * legitimately equals the total and must be kept.
   */
  if (receiptTotal !== null && items.length > 1) {
    const filtered = items.filter((i) => Math.abs(i.amount - receiptTotal) >= 0.005);
    // Only apply it if something survives — a receipt whose every line equals
    // the total is not something this rule can reason about.
    if (filtered.length > 0) return filtered;
  }

  return items;
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
