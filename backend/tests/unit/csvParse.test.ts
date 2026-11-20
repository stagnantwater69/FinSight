import { describe, expect, it } from "vitest";
import { parseCsv } from "../../src/lib/csvParse";
import { CSV_MAX_FILE_BYTES } from "../../src/lib/csvUploadValidation";
import { ApiError } from "../../src/middleware/error.middleware";

/**
 * Characterization tests for the CSV parser's delimiter choice, limits and
 * error codes. The database-backed suites cover the same paths end to end;
 * these keep them in the fast gate.
 */

function csv(text: string): Buffer {
  return Buffer.from(text, "utf8");
}

function columns(count: number): string {
  return Array.from({ length: count }, (_, index) => `c${index}`).join(",");
}

function errorFrom(upload: Buffer): ApiError {
  try {
    parseCsv(upload);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("parseCsv did not throw");
}

describe("parseCsv delimiter detection", () => {
  it("parses a comma file", () => {
    expect(parseCsv(csv("Date,Amount\n2026-01-01,5\n"))).toEqual({
      delimiter: ",",
      headers: ["Date", "Amount"],
      records: [{ Date: "2026-01-01", Amount: "5" }],
    });
  });

  it("parses a semicolon file", () => {
    expect(parseCsv(csv("Date;Amount\n2026-01-01;5\n"))).toEqual({
      delimiter: ";",
      headers: ["Date", "Amount"],
      records: [{ Date: "2026-01-01", Amount: "5" }],
    });
  });

  it("parses a tab file", () => {
    expect(parseCsv(csv("Date\tAmount\n2026-01-01\t5\n"))).toEqual({
      delimiter: "\t",
      headers: ["Date", "Amount"],
      records: [{ Date: "2026-01-01", Amount: "5" }],
    });
  });

  it("resolves a comma/semicolon tie to comma", () => {
    expect(parseCsv(csv("a,b;c\n1,2;3\n"))).toEqual({
      delimiter: ",",
      headers: ["a", "b;c"],
      records: [{ a: "1", "b;c": "2;3" }],
    });
  });

  it("counts the header only, so commas in semicolon data cells stay inside the cell", () => {
    expect(parseCsv(csv("Date;Description;Amount\n2026-01-01;Rice, Eggs, Oil;12,50\n"))).toEqual({
      delimiter: ";",
      headers: ["Date", "Description", "Amount"],
      records: [{ Date: "2026-01-01", Description: "Rice, Eggs, Oil", Amount: "12,50" }],
    });
  });
});

describe("parseCsv limits", () => {
  it("refuses a file over the size cap before decoding it", () => {
    expect(errorFrom(Buffer.alloc(CSV_MAX_FILE_BYTES + 1, "a"))).toMatchObject({
      status: 413,
      code: "CSV_FILE_TOO_LARGE",
      message: "This file is larger than 5 MB. Split it into smaller files and import them one at a time.",
    });
  });

  it("refuses 257 columns", () => {
    expect(errorFrom(csv(`${columns(257)}\n`))).toMatchObject({
      status: 400,
      code: "CSV_HEADER_LIMIT_EXCEEDED",
      message: "CSV files can have at most 256 columns.",
    });
  });

  it("accepts 256 columns", () => {
    const parsed = parseCsv(csv(`${columns(256)}\n${",".repeat(255)}\n`));
    expect(parsed.headers).toHaveLength(256);
    expect(parsed.records).toHaveLength(1);
  });

  it("refuses a 256-character header", () => {
    expect(errorFrom(csv(`${"h".repeat(256)},Amount\n1,2\n`))).toMatchObject({
      status: 400,
      code: "CSV_HEADER_LIMIT_EXCEEDED",
      message: "CSV column headers must be 255 characters or fewer.",
    });
  });

  it("accepts a 255-character header", () => {
    const longHeader = "h".repeat(255);
    expect(parseCsv(csv(`${longHeader},Amount\n1,2\n`)).headers).toEqual([longHeader, "Amount"]);
  });

  it("refuses a blank header", () => {
    expect(errorFrom(csv("Date, ,Amount\n1,2,3\n"))).toMatchObject({
      status: 400,
      code: undefined,
      message: "Every CSV column needs a header. Name the empty columns and try again.",
    });
  });

  it("refuses headers that differ only by letter case", () => {
    expect(errorFrom(csv("Amount,amount\n1,2\n"))).toMatchObject({
      status: 400,
      code: undefined,
      message: "CSV column headers must be unique. Rename repeated columns and try again.",
    });
  });

  it("refuses more than 3,000,000 cells, empty ones included", () => {
    // 11,720 rows x 256 empty cells = 3,000,320 cells in about 3 MB.
    const upload = csv(`${columns(256)}\n${`${",".repeat(255)}\n`.repeat(11_720)}`);
    expect(upload.byteLength).toBeLessThan(CSV_MAX_FILE_BYTES);
    expect(errorFrom(upload)).toMatchObject({
      status: 413,
      code: "CSV_PARSE_LIMIT_EXCEEDED",
      message: "This CSV is too large or complex to process safely. Split it into smaller files.",
    });
  });

  it("refuses a record over the 256 KiB record size", () => {
    expect(errorFrom(csv(`Date,Description\n2026-01-01,${"x".repeat(300 * 1024)}\n`))).toMatchObject({
      status: 413,
      code: "CSV_PARSE_LIMIT_EXCEEDED",
      message: "A CSV row is too large to process safely. Split the file and try again.",
    });
  });
});

describe("parseCsv unreadable input", () => {
  it("returns a fixed message that never echoes cell contents", () => {
    const marker = "CELL-MARKER-7f3a";
    const error = errorFrom(csv(`Date,Description\n2026-01-01,"${marker}\n`));
    expect(error).toMatchObject({
      status: 400,
      code: undefined,
      message: "This CSV could not be read. Check its quotes and column counts, then try again.",
    });
    expect(error.message).not.toContain(marker);
    expect(JSON.stringify(error.responseDetails ?? {})).not.toContain(marker);
  });
});
