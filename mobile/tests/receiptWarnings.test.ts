import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  RECEIPT_WARNING_CODES,
  fieldsNeedingAttention,
  warningHeadline,
  warningPageSuffix,
  warningTone,
  type ReceiptWarning,
} from "../src/lib/receiptWarnings";

/**
 * The warning contract, from the client's side.
 *
 * THE DEFECT THIS GUARDS: the app and the website each used to write their own
 * sentence for the same scan signals, and the two had already drifted apart.
 * The sentence is now the server's (`guidance`) and this lib holds only codes
 * and presentation — so the test that matters most is the one asserting no
 * prose is invented here.
 */

const BACKEND_WARNINGS = join(__dirname, "..", "..", "backend", "src", "lib", "receiptWarnings.ts");

function warning(overrides: Partial<ReceiptWarning> = {}): ReceiptWarning {
  return { code: "BLURRY_PAGE", guidance: "Hold the phone steady and retake this page.", ...overrides };
}

describe("the warning vocabulary", () => {
  /*
   * Read out of the server's own file rather than copied, because a code
   * added there and not here would otherwise fall through to the generic
   * headline silently — which looks like a working screen.
   */
  it("covers every code the server can emit", () => {
    const src = readFileSync(BACKEND_WARNINGS, "utf8");
    const block = src.slice(src.indexOf("export const WARNING_CODES"), src.indexOf("] as const"));
    const serverCodes = [...block.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]!);
    expect(serverCodes.length).toBeGreaterThan(5);
    expect([...RECEIPT_WARNING_CODES].sort()).toEqual([...serverCodes].sort());
  });

  it("has a headline for every code, and a safe one for a code it has never seen", () => {
    for (const code of RECEIPT_WARNING_CODES) {
      expect(warningHeadline(code).length).toBeGreaterThan(5);
    }
    expect(warningHeadline("SOMETHING_NEW")).toBe("FinSight flagged something on this receipt");
  });

  /*
   * UNVERIFIED_ITEMS is the provider-items case: the lines were prefilled for
   * review, never validated. Its headline is its own, not the generic
   * fallback, and it is a real warning rather than an informational note.
   */
  it("names unverified provider items rather than falling through to the generic headline", () => {
    expect(warningHeadline("UNVERIFIED_ITEMS")).toBe("These line items couldn't be verified");
    expect(warningHeadline("UNVERIFIED_ITEMS")).not.toContain("\u2014");
    expect(warningTone("UNVERIFIED_ITEMS")).toBe("warn");
  });

  /*
   * OVERLAPPING_PAGES describes the capture overlap the multi-page guide ASKS
   * for. Warning an owner for following the instructions is how a warning
   * system loses its meaning.
   */
  it("does not raise an alarm about the overlap it asked for", () => {
    expect(warningTone("OVERLAPPING_PAGES")).toBe("info");
    expect(warningTone("BLURRY_PAGE")).toBe("warn");
    expect(warningTone("UNEXPLAINED_GAP")).toBe("warn");
  });

  it("names a page only when the warning is about one", () => {
    expect(warningPageSuffix(warning({ pageNumber: 2 }))).toBe(" (page 2)");
    expect(warningPageSuffix(warning())).toBe("");
  });
});

describe("which fields to point the owner at", () => {
  it("lists them in the order the review form presents them", () => {
    const warnings = [
      warning({ code: "UNREADABLE_FIELD", field: "amount" }),
      warning({ code: "AMBIGUOUS_DATE", field: "date" }),
      warning({ code: "UNREADABLE_FIELD", field: "vendor" }),
    ];
    expect(fieldsNeedingAttention(warnings)).toEqual(["date", "vendor", "amount"]);
  });

  it("normalises the server's field names onto the form's own", () => {
    expect(fieldsNeedingAttention([warning({ field: "extractedVendor" })])).toEqual(["vendor"]);
    expect(fieldsNeedingAttention([warning({ field: "total" })])).toEqual(["amount"]);
  });

  it("ignores a warning about no field in particular", () => {
    expect(fieldsNeedingAttention([warning()])).toEqual([]);
    expect(fieldsNeedingAttention([warning({ field: "something-else" })])).toEqual([]);
  });

  it("says each field once, however many warnings name it", () => {
    expect(
      fieldsNeedingAttention([warning({ field: "date" }), warning({ field: "date" })]),
    ).toEqual(["date"]);
  });
});
