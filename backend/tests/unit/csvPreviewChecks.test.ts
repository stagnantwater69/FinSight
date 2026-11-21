import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/lib/apiError";
import { detectDateFormatFromRecords, validateMapping } from "../../src/lib/csvPreviewChecks";
import type { PreviewOptions } from "../../src/services/csvImport.service";

/**
 * Characterization tests for the CSV preview's date-column detection and
 * column-mapping checks, kept database-free so the fast gate covers them.
 */

function column(values: string[], header = "Date"): Record<string, string>[] {
  return values.map((value) => ({ [header]: value }));
}

describe("detectDateFormatFromRecords", () => {
  it("reads an ISO date column as iso", () => {
    expect(detectDateFormatFromRecords(column(["2026-01-05", "2026-02-10"]))).toEqual({
      format: "iso",
      ambiguous: false,
    });
  });

  it("reads a day-first column as dmy", () => {
    expect(detectDateFormatFromRecords(column(["25/12/2026", "01/05/2026"]))).toEqual({
      format: "dmy",
      ambiguous: false,
    });
  });

  it("reads a month-first column as mdy", () => {
    expect(detectDateFormatFromRecords(column(["12/25/2026", "01/05/2026"]))).toEqual({
      format: "mdy",
      ambiguous: false,
    });
  });

  it("reports a column that fits both conventions as ambiguous dmy", () => {
    expect(detectDateFormatFromRecords(column(["01/05/2026", "03/04/2026"]))).toEqual({
      format: "dmy",
      ambiguous: true,
    });
  });

  it("skips an amount column before the date column", () => {
    const records = [
      { Amount: "12.05", Date: "25/12/2026" },
      { Amount: "03.10", Date: "26/12/2026" },
    ];
    expect(detectDateFormatFromRecords(records)).toEqual({ format: "dmy", ambiguous: false });
  });

  it("counts a column as dates when 4 of 5 values are date-shaped", () => {
    const records = column(["25/12/2026", "26/12/2026", "27/12/2026", "28/12/2026", "typo"]);
    expect(detectDateFormatFromRecords(records)).toEqual({ format: "dmy", ambiguous: false });
  });

  it("does not count a column as dates when only 3 of 5 values are date-shaped", () => {
    const records = column(["25/12/2026", "26/12/2026", "27/12/2026", "n/a", "tbd"]);
    expect(detectDateFormatFromRecords(records)).toEqual({ format: "iso", ambiguous: false });
  });

  it("samples only the first 500 rows", () => {
    const records = column([...Array(500).fill("2026-01-05"), ...Array(10).fill("25/12/2026")]);
    expect(detectDateFormatFromRecords(records)).toEqual({ format: "iso", ambiguous: false });
  });

  it("falls back to iso for an empty record list", () => {
    expect(detectDateFormatFromRecords([])).toEqual({ format: "iso", ambiguous: false });
  });

  it("falls back to iso when no column is date-shaped", () => {
    const records = [
      { Description: "Rice", Amount: "12.05" },
      { Description: "Oil", Amount: "40.00" },
    ];
    expect(detectDateFormatFromRecords(records)).toEqual({ format: "iso", ambiguous: false });
  });
});

const headers = ["Date", "Description", "Amount", "Type"];

const expenseOptions: PreviewOptions = {
  recordType: "expense",
  columnMapping: { date: "Date", description: "Description", amount: "Amount" },
};

function errorFrom(options: PreviewOptions): ApiError {
  try {
    validateMapping(headers, options);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("validateMapping did not throw");
}

describe("validateMapping", () => {
  it("rejects a mapped column that is not in the CSV", () => {
    const error = errorFrom({
      ...expenseOptions,
      columnMapping: { ...expenseOptions.columnMapping, amount: "Total" },
    });
    expect(error).toMatchObject({
      status: 400,
      message: "A mapped column is missing from this CSV. Check the column mapping and try again.",
    });
    expect(error.code).toBeUndefined();
  });

  it("rejects a mixed file without a strategy", () => {
    const error = errorFrom({ ...expenseOptions, recordType: "mixed" });
    expect(error).toMatchObject({ status: 400, message: "Choose how this file identifies sales and expenses." });
    expect(error.code).toBeUndefined();
  });

  it("rejects a mixed column strategy without a record-type column", () => {
    const error = errorFrom({ ...expenseOptions, recordType: "mixed", mixedStrategy: "column" });
    expect(error).toMatchObject({ status: 400, message: "Choose the column that identifies sales and expenses." });
    expect(error.code).toBeUndefined();
  });

  it("does not treat empty or undefined mapping values as missing columns", () => {
    expect(() =>
      validateMapping(headers, {
        ...expenseOptions,
        columnMapping: { ...expenseOptions.columnMapping, category: "", vendor: undefined },
      }),
    ).not.toThrow();
  });

  it("accepts a valid expense mapping", () => {
    expect(validateMapping(headers, expenseOptions)).toBeUndefined();
  });

  it("accepts a mixed sign mapping without a record-type column", () => {
    expect(validateMapping(headers, { ...expenseOptions, recordType: "mixed", mixedStrategy: "sign" })).toBeUndefined();
  });
});
