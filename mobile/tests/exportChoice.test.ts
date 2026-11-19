import { describe, expect, it } from "vitest";
import { countFor, exportRequest, presetMonths } from "../src/lib/exportChoice";

describe("export quick picks", () => {
  it("cover the right months, including across a new year", () => {
    expect(presetMonths("thisMonth", "2026-11-19")).toEqual(["2026-11"]);
    expect(presetMonths("lastMonth", "2026-01-05")).toEqual(["2025-12"]);
    expect(presetMonths("thisQuarter", "2026-11-19")).toEqual(["2026-10", "2026-11"]);
    expect(presetMonths("thisQuarter", "2026-03-31")).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(presetMonths("thisYear", "2026-02-01")).toEqual(["2026-01", "2026-02"]);
    expect(presetMonths("lastYear", "2026-11-19")).toHaveLength(12);
    expect(presetMonths("lastYear", "2026-11-19")![0]).toBe("2025-01");
    expect(presetMonths("range", "2026-11-19")).toBeNull();
  });
});

describe("export counts", () => {
  const counts = [
    { month: "2026-11", expenses: 10, sales: 3 },
    { month: "2026-02", expenses: 4, sales: 1 },
  ];
  it("adds only the chosen months and kinds", () => {
    expect(countFor(counts, ["2026-11"], "all")).toBe(13);
    expect(countFor(counts, ["2026-11", "2026-02"], "expense")).toBe(14);
    expect(countFor(counts, ["2026-02"], "sales")).toBe(1);
    expect(countFor(counts, ["2025-01"], "all")).toBe(0);
    expect(countFor(counts, null, "all")).toBe(18);
  });
});

describe("export requests", () => {
  it("sends a sorted month list and names the file for its span", () => {
    expect(exportRequest(7, "all", { months: ["2026-05", "2026-01", "2026-03"] })).toEqual({
      query: { businessProfileId: 7, type: "all", months: "2026-01,2026-03,2026-05" },
      name: "finsight-records-2026-01-to-2026-05",
    });
    expect(exportRequest(7, "sales", { months: ["2026-11"] }).name).toBe("finsight-sales-2026-11");
    expect(exportRequest(7, "expense", { dateFrom: "2026-10-15", dateTo: "2026-11-14" })).toEqual({
      query: { businessProfileId: 7, type: "expense", dateFrom: "2026-10-15", dateTo: "2026-11-14" },
      name: "finsight-expense-2026-10-15-to-2026-11-14",
    });
    expect(exportRequest(7, "all", null)).toEqual({ query: { businessProfileId: 7, type: "all" }, name: "finsight-all-records" });
  });
});
