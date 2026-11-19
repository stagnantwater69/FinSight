import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { CSV_BOM, csvCell, csvRow, csvRowWithAmount } from "../../src/lib/csv";

describe("csv encoder", () => {
  it("leaves plain text alone and turns null into an empty cell", () => {
    expect(csvCell("Rice 25kg")).toBe("Rice 25kg");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes commas, quotes and line breaks per RFC 4180", () => {
    expect(csvCell("Sugar, brown")).toBe('"Sugar, brown"');
    expect(csvCell('12" pan')).toBe('"12"" pan"');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(csvCell("a\r\nb")).toBe('"a\r\nb"');
  });

  it("neutralises cells a spreadsheet would run as a formula", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+639171234567")).toBe("'+639171234567");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tcmd")).toBe("'\tcmd");
    expect(csvCell("\rcmd")).toBe("\"'\rcmd\"");
  });

  it("keeps peso signs and Filipino names as UTF-8", () => {
    expect(csvRow(["Ñino's Bakery", "₱ deposit"])).toBe("Ñino's Bakery,₱ deposit\r\n");
    expect(CSV_BOM).toBe("\uFEFF");
    expect(Buffer.from(CSV_BOM, "utf8")).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  });

  it("writes amounts as exact two-decimal numbers from the Decimal column", () => {
    const amount = new Prisma.Decimal("9999999999.99").toFixed(2);
    expect(csvRowWithAmount(["2026-01-02", "Expense"], amount, ["Manual Entry"])).toBe(
      "2026-01-02,Expense,9999999999.99,Manual Entry\r\n",
    );
    expect(new Prisma.Decimal("0.1").plus("0.2").toFixed(2)).toBe("0.30");
    expect(new Prisma.Decimal("5").toFixed(2)).toBe("5.00");
    expect(() => csvRowWithAmount([], "=1+1", [])).toThrow();
  });
});
