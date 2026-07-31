/**
 * How a corpus run is scored, shared by every assessment.
 *
 * Extracted so the deterministic pipeline (run-assessment.ts) and any
 * alternative extractor being evaluated against it (vision-spike.ts) are
 * judged by exactly the same rules. Two comparable numbers require one
 * scorer; a second copy of these rules would eventually drift from the first
 * and quietly make the comparison meaningless.
 *
 * Moved here verbatim from run-assessment.ts — no rule was changed in the
 * move, and the corpus results are identical before and after it.
 */

export interface ExpectedItem {
  name: string;
  quantity: number | null;
  amount: number;
}

export interface ExtractedItem {
  name: string;
  quantity: number | null;
  amount: number;
}

/**
 * Item scoring is per-item, not per-receipt, and each attribute is counted
 * separately so a right name with a wrong price is visible as exactly that.
 *
 * An extracted item is matched to a ground-truth item by AMOUNT first, since
 * the amount is the field the books actually depend on and the one OCR gets
 * right most often. Name is then scored on that pairing. An extracted item
 * matching no expected amount is a false positive — the number that matters
 * most here, because a fabricated line puts money in the owner's records
 * that was never on the receipt.
 */
export interface ItemScore {
  expected: number;
  matched: number;
  nameCorrect: number;
  quantityCorrect: number;
  quantityScored: number;
  falsePositives: number;
}

export type Verdict = "correct" | "wrong" | "missed" | "n/a";

/** Vendor matching is deliberately lenient about OCR character noise. */
export function normalizeVendor(v: string | null): string {
  return (v ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreVendor(expected: string | null, actual: string | null): Verdict {
  // Some receipts genuinely contain no vendor name (e.g. the real photo whose
  // header is cropped). Scoring those as failures would be dishonest — the
  // information is not in the image.
  if (expected === null) return "n/a";
  if (actual === null) return "missed";

  const e = normalizeVendor(expected);
  const a = normalizeVendor(actual);
  if (e === a) return "correct";

  // Allow light OCR noise: accept if the words largely agree.
  const ew = e.split(" ").filter(Boolean);
  const aw = a.split(" ").filter(Boolean);
  const hits = ew.filter((w) => aw.some((x) => x === w || (w.length > 3 && x.includes(w.slice(0, 4))))).length;
  return hits / ew.length >= 0.7 ? "correct" : "wrong";
}

export function scoreDate(expected: string | null, actual: string | null): Verdict {
  if (expected === null) return "n/a";
  if (actual === null) return "missed";
  return actual === expected ? "correct" : "wrong";
}

export function scoreAmount(expected: number | null, actual: number | null): Verdict {
  if (expected === null) return "n/a";
  if (actual === null) return "missed";
  // Exact to the centavo. An amount that is "close" is still wrong money.
  return Math.abs(actual - expected) < 0.005 ? "correct" : "wrong";
}

/** Same leniency as vendor matching: light OCR character noise, not a wrong line. */
export function itemNamesMatch(expected: string, actual: string): boolean {
  const norm = (x: string) => x.toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const e = norm(expected);
  const a = norm(actual);
  if (e === a) return true;
  const ew = e.split(" ").filter(Boolean);
  const aw = a.split(" ").filter(Boolean);
  if (ew.length === 0) return false;
  const hits = ew.filter((w) => aw.some((x) => x === w || (w.length > 3 && x.includes(w.slice(0, 4))))).length;
  return hits / ew.length >= 0.6;
}

export function scoreItems(expected: ExpectedItem[], actual: ExtractedItem[]): ItemScore {
  const score: ItemScore = {
    expected: expected.length,
    matched: 0,
    nameCorrect: 0,
    quantityCorrect: 0,
    quantityScored: 0,
    falsePositives: 0,
  };
  const unclaimed = [...expected];

  for (const got of actual) {
    const i = unclaimed.findIndex((e) => Math.abs(e.amount - got.amount) < 0.005);
    if (i === -1) {
      score.falsePositives++;
      continue;
    }
    const exp = unclaimed.splice(i, 1)[0]!;
    score.matched++;
    if (itemNamesMatch(exp.name, got.name)) score.nameCorrect++;
    // Quantity is only scored where the receipt actually prints one.
    if (exp.quantity !== null) {
      score.quantityScored++;
      if (got.quantity === exp.quantity) score.quantityCorrect++;
    }
  }
  return score;
}

export function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(0)}%`;
}

export const SYMBOL: Record<Verdict, string> = { correct: "✅", wrong: "❌", missed: "⬜", "n/a": "—" };
