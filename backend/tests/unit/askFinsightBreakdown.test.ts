import { describe, expect, it } from "vitest";
import { breakdownIntent, isFollowUp, LOOKUP_CUE } from "../../src/lib/chatIntents";
import { extractComparedMonths, extractNamedMonths, extractQuestionPeriod } from "../../src/lib/questionPeriod";
import { parseToolCalls } from "../../src/lib/chatTools";
import { recordBalanceLines, searchTerms } from "../../src/services/aiContext.service";

/**
 * The readers behind "rank my monthly expense this year": which questions
 * want one figure per month or week, which periods they cover, and which
 * planner replies are allowed to become database lookups.
 */

const today = new Date(Date.UTC(2026, 10, 19)); // 2026-11-19

const reply = (...calls: { name: unknown; args?: unknown }[]) => ({
  candidates: [{ content: { parts: calls.map((functionCall) => ({ functionCall })) } }],
});

describe("breakdownIntent", () => {
  it.each([
    ["rank my monthly expense this year, from least to greatest", { subject: "expense", groupBy: "month", order: "asc" }],
    ["which month did I spend the most in 2025?", { subject: "expense", groupBy: "month", order: "desc" }],
    ["which month did I spend the least?", { subject: "expense", groupBy: "month", order: "asc" }],
    ["show my expenses month by month", { subject: "expense", groupBy: "month", order: "chronological" }],
    ["sales by month last year", { subject: "sales", groupBy: "month", order: "chronological" }],
    ["gastos ko kada buwan ngayong taon", { subject: "expense", groupBy: "month", order: "chronological" }],
    ["weekly spending in March 2026", { subject: "expense", groupBy: "week", order: "chronological" }],
    ["rank my months by spending", { subject: "expense", groupBy: "month", order: "desc" }],
    ["which vendor did I pay the most this year?", { subject: "expense", groupBy: "vendor", order: "desc" }],
    ["which supplier do I spend the least on?", { subject: "expense", groupBy: "vendor", order: "asc" }],
    ["what is my biggest expense category this month?", { subject: "expense", groupBy: "category", order: "desc" }],
    ["expenses by category last year", { subject: "expense", groupBy: "category", order: "desc" }],
    ["anong vendor ang pinakamalaki kong gastos ngayong taon?", { subject: "expense", groupBy: "vendor", order: "desc" }],
  ])("reads %j as a breakdown", (question, expected) => {
    expect(breakdownIntent(question)).toEqual(expected);
  });

  it.each([
    "how much did I spend this month?",
    "what did I spend last week?",
    "how much did I spend on rice in March?",
    "what if my monthly costs were 100k?",
    "what are my monthly bills?",
    "which category moved the most?",
    "is my Utilities category up this month?",
    "add a new vendor",
  ])("does not read %j as a breakdown", (question) => {
    expect(breakdownIntent(question)).toBeNull();
  });

  it("treats three named months as month by month", () => {
    expect(breakdownIntent("compare January, February and March", 3)).toMatchObject({ groupBy: "month" });
    expect(breakdownIntent("compare January and February", 2)).toBeNull();
  });
});

describe("search terms", () => {
  it("never searches records for period or ranking words", () => {
    // The bug: "monthly" matched "Monthly electricity and water" and "Monthly burger stall rent".
    expect(searchTerms("rank my monthly expense this year, from least to greatest")).toEqual([]);
    expect(searchTerms("weekly rice spending")).toEqual(["rice"]);
  });
});

describe("question periods", () => {
  it.each([
    ["January to March 2026", "January to March 2026", 90],
    ["from jan to mar", "January to March 2026", 90],
    ["Oct 2025 - Feb 2026", "October 2025 to February 2026", 151],
    ["Q1 2026", "Q1 2026 (January to March 2026)", 90],
    ["first quarter", "Q1 2026 (January to March 2026)", 90],
    ["September to December", "September to December 2026, so far", 80],
    ["January, February and March 2026", "January to March 2026", 90],
  ])("reads %j as a span of months", (question, label, days) => {
    const period = extractQuestionPeriod(question, today);
    expect(period?.label).toBe(label);
    expect(period?.selection).toMatchObject({ kind: "rolling", days });
  });

  it("puts an unstarted span in the past year", () => {
    expect(extractQuestionPeriod("Q4", new Date(Date.UTC(2026, 2, 1)))?.label).toBe("Q4 2025 (October to December 2025)");
  });

  it("still reads single months and years as before", () => {
    expect(extractQuestionPeriod("in March 2026", today)?.label).toBe("March 2026");
    expect(extractQuestionPeriod("this year", today)?.label).toBe("2026 so far");
  });

  it("compares two months, and leaves three or more to the breakdown", () => {
    expect(extractComparedMonths("March vs April 2026", today)?.map((m) => m.label)).toEqual(["March 2026", "April 2026"]);
    expect(extractComparedMonths("January, February and March 2026", today)).toBeNull();
    expect(extractNamedMonths("March, January and February 2026", today).map((m) => m.label)).toEqual([
      "January 2026", "February 2026", "March 2026",
    ]);
  });
});

describe("follow-ups", () => {
  it.each(["what about last year?", "and in March?", "how about sales?", "e yung sales naman?"])("reads %j as a follow-up", (q) => {
    expect(isFollowUp(q)).toBe(true);
  });
  it.each(["how much did I spend on rice?", "rank my monthly expense this year"])("reads %j as a new question", (q) => {
    expect(isFollowUp(q)).toBe(false);
  });
});

describe("lookup cue", () => {
  it("spends a planning call only on lookup-style questions", () => {
    expect(LOOKUP_CUE.test("which vendor did I pay the most?")).toBe(true);
    expect(LOOKUP_CUE.test("expenses over 5,000 in Utilities")).toBe(true);
    expect(LOOKUP_CUE.test("hello Fin")).toBe(false);
    expect(LOOKUP_CUE.test("explain this flag")).toBe(false);
  });
});

describe("parseToolCalls", () => {
  it("keeps valid calls and fills defaults", () => {
    expect(parseToolCalls(reply({ name: "expense_totals", args: { period: "this year", group_by: "vendor" } }))).toEqual([
      { name: "expense_totals", args: { period: "this year", group_by: "vendor", order: "desc" } },
    ]);
  });

  it("drops unknown tools, bad arguments and extra fields", () => {
    expect(
      parseToolCalls(
        reply(
          { name: "delete_records", args: {} },
          { name: "expense_totals", args: { period: "this year", group_by: "day" } },
          // A model trying to pick the business it reads: never accepted.
          { name: "open_findings", args: { businessProfileId: 7 } },
          { name: "find_records", args: { period: "x".repeat(200) } },
          { name: "find_records", args: { period: "this year", min_amount: -5 } },
        ),
      ),
    ).toEqual([]);
  });

  it("caps the plan at three calls and drops duplicates", () => {
    const call = { name: "recovery_status", args: {} };
    const calls = parseToolCalls(
      reply(
        call,
        call,
        { name: "open_findings", args: {} },
        { name: "compare_periods", args: { first: "March 2026", second: "April 2026" } },
        { name: "sales_totals", args: { period: "2025", group_by: "month" } },
      ),
    );
    expect(calls.map((c) => c.name)).toEqual(["recovery_status", "open_findings", "compare_periods"]);
  });

  it("returns nothing for a text reply or garbage", () => {
    expect(parseToolCalls({ candidates: [{ content: { parts: [{ text: "NONE" }] } }] })).toEqual([]);
    expect(parseToolCalls(null)).toEqual([]);
    expect(parseToolCalls({ candidates: "nope" })).toEqual([]);
  });
});

describe("recordBalanceLines", () => {
  const basis = (salesRecords: number, expenseRecords: number) => ({ salesRecords, expenseRecords, from: null, to: "2026-11-19" });

  it("names a lopsided sales-to-expense count as worth checking", () => {
    // The owner's real all-time counts.
    const lines = recordBalanceLines(basis(57205, 7195), "all time");
    expect(lines).toContain(
      "- Records for all time: 57,205 sales records but only 7,195 counted expense records, about 8 sales records for every expense record.",
    );
    expect(lines.join(" ")).toContain("Missing expenses make profit look bigger");
  });

  it("names sales with no expenses at all", () => {
    expect(recordBalanceLines(basis(60, 0), "2026 so far")[2]).toBe(
      "- Records for 2026 so far: 60 sales records but no counted expense records at all.",
    );
  });

  it.each([
    ["a balanced business", 400, 100],
    ["too few sales to judge", 49, 0],
    ["just under the line", 499, 100],
  ])("stays quiet for %s", (_label, sales, expenses) => {
    expect(recordBalanceLines(basis(sales, expenses), "all time")).toEqual([]);
  });
});
