import { describe, expect, it } from "vitest";
import { buildReceiptConfirmPayload } from "../src/lib/receiptConfirm";

/**
 * The contract this screen broke once already.
 *
 * Mobile posted `categoryId` long after the server stopped accepting it. Zod
 * strips unknown keys rather than rejecting them, so the field vanished
 * without an error, `splits` arrived empty, and EVERY receipt confirmation on
 * mobile was rejected with "Assign the receipt to at least one category".
 *
 * These are deliberately pinned against the SERVER's schema
 * (backend/src/controllers/receiptScan.controller.ts `confirmSchema`), not
 * against whatever the client happens to do — a test that only restates the
 * implementation would have passed happily throughout the outage.
 */

const base = {
  date: "2026-07-31",
  description: "Groceries",
  vendor: "ABC Sari-Sari Store",
  amount: 188,
  categoryId: 7,
};

describe("the shape the server actually accepts", () => {
  it("sends splits, because there is no single-category shape", () => {
    const out = buildReceiptConfirmPayload(base);
    expect(out.splits).toEqual([{ categoryId: 7, amount: 188 }]);
  });

  /** The specific regression. A stray categoryId is silently dropped server-side. */
  it("does not send a top-level categoryId", () => {
    expect(buildReceiptConfirmPayload(base)).not.toHaveProperty("categoryId");
  });

  /**
   * The server compares splits against the total in centavos and refuses a
   * mismatch, so "close" is not good enough.
   */
  it("makes the splits sum to the confirmed total exactly", () => {
    for (const amount of [188, 1400, 0.01, 1220.55, 99999.99]) {
      const out = buildReceiptConfirmPayload({ ...base, amount });
      const summed = out.splits.reduce((s, x) => s + Math.round(x.amount * 100), 0);
      expect(summed, `total ${amount}`).toBe(Math.round(amount * 100));
    }
  });

  it("carries the fields the server requires", () => {
    const out = buildReceiptConfirmPayload(base);
    expect(out.date).toBe("2026-07-31");
    expect(out.description).toBe("Groceries");
    expect(out.amount).toBe(188);
  });
});

describe("vendor and description handling", () => {
  it("omits the vendor rather than sending an empty one", () => {
    const out = buildReceiptConfirmPayload({ ...base, vendor: "   " });
    expect(out).not.toHaveProperty("vendor");
  });

  it("trims a real vendor", () => {
    expect(buildReceiptConfirmPayload({ ...base, vendor: "  ABC Store  " }).vendor).toBe("ABC Store");
  });

  /** description is min(1) server-side, so an empty one would be a 400. */
  it("falls back to a description rather than sending an empty string", () => {
    expect(buildReceiptConfirmPayload({ ...base, description: "   " }).description).toBe("Receipt purchase");
  });

  it("trims a real description", () => {
    expect(buildReceiptConfirmPayload({ ...base, description: "  Groceries  " }).description).toBe("Groceries");
  });
});
