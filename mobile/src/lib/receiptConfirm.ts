/**
 * The body sent to POST /records/receipts/:id/confirm.
 *
 * Pulled out of the screen as a pure function for one reason: it is the shape
 * that silently broke. The screen used to post `categoryId`, which the server
 * had stopped accepting when receipts gained multi-category splitting. Zod
 * strips unknown keys instead of rejecting them, so the field disappeared
 * without a word, `splits` arrived empty, and every receipt confirmation on
 * mobile failed with "Assign the receipt to at least one category".
 *
 * Nothing could catch that: the response was typed `any` here, the two apps
 * share no contract, and a backend test cannot observe what a client sends.
 * A function can at least be tested.
 */

export interface ReceiptConfirmPayload {
  date: string;
  description: string;
  vendor?: string;
  amount: number;
  /**
   * One entry per category the receipt covers, summing to `amount` exactly.
   *
   * The server compares in centavos, so the arithmetic has to be right rather
   * than close. A receipt filed under a single category is a split of one —
   * there is no separate single-category shape, and assuming there was is
   * what caused the outage this function documents.
   */
  splits: { categoryId: number; amount: number }[];
}

export interface ReceiptConfirmInput {
  date: string;
  description: string;
  vendor: string;
  /** The confirmed total, already validated as a positive number by the caller. */
  amount: number;
  categoryId: number;
}

/** The literal fallback the backend uses when it read no vendor to describe. */
const FALLBACK_DESCRIPTION = "Receipt purchase";

export function buildReceiptConfirmPayload(input: ReceiptConfirmInput): ReceiptConfirmPayload {
  const description = input.description.trim() || FALLBACK_DESCRIPTION;
  const vendor = input.vendor.trim();

  return {
    date: input.date,
    description,
    // Omitted rather than sent empty: the field is optional server-side, and
    // "" would store a vendor the receipt never had.
    ...(vendor ? { vendor } : {}),
    amount: input.amount,
    splits: [{ categoryId: input.categoryId, amount: input.amount }],
  };
}
