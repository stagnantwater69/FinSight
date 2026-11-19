import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/config/prisma";
import * as expenses from "../../src/services/expenseRecord.service";
import * as sales from "../../src/services/salesRecord.service";
import { buildModuleContext } from "../../src/services/aiContext.service";
import type { ToolCall } from "../../src/lib/chatTools";
import { disconnectDb, makeOwnerWithProfile, resetDb } from "../setup/testDb";

/**
 * The Ask FinSight question set: real questions, a seeded business, and what
 * the context handed to the model must (and must not) contain. No model is
 * called. A question that comes back wrong from the model is either a context
 * gap, caught here, or a wording problem, caught by tests/ai-eval.
 *
 * Case 1 is the question that started this: "rank my monthly expense this
 * year, from least to greatest" was answered with two records named
 * "Monthly ...", because no per-month totals existed.
 */

// A finished year, so the months are fixed whatever day the suite runs.
const year = new Date().getUTCFullYear() - 1;
const day = (month: number, date: number) => `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;

let alice: Awaited<ReturnType<typeof makeOwnerWithProfile>>;
let mallory: Awaited<ReturnType<typeof makeOwnerWithProfile>>;

async function expense(owner: typeof alice, date: string, description: string, amount: number, extra: { vendor?: string; category?: string } = {}) {
  return expenses.createExpenseRecord(owner.user.id, {
    businessProfileId: owner.profile.id,
    categoryId: owner.categories[extra.category ?? "Supplies"]!,
    date,
    description,
    amount,
    ...(extra.vendor ? { vendor: extra.vendor } : {}),
  });
}

async function ask(
  owner: typeof alice,
  question: string,
  options: Parameters<typeof buildModuleContext>[5] = {},
) {
  const profile = await prisma.businessProfile.findUniqueOrThrow({ where: { id: owner.profile.id } });
  return buildModuleContext(owner.user.id, profile, "Dashboard", question, undefined, options);
}

/** The lines of one === section === of the context. */
function section(context: string, heading: string): string[] {
  const lines = context.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`=== ${heading}`));
  if (start === -1) return [];
  const end = lines.findIndex((line, index) => index > start && (line.startsWith("===") || line === ""));
  return lines.slice(start, end === -1 ? undefined : end);
}

beforeEach(async () => {
  await resetDb();
  alice = await makeOwnerWithProfile({}, ["Supplies", "Utilities"]);
  mallory = await makeOwnerWithProfile({}, ["Supplies", "Utilities"]);
  await expense(alice, day(1, 10), "Rice sack", 400, { vendor: "Palengke" });
  await expense(alice, day(1, 20), "Monthly electricity and water", 600, { vendor: "Meralco", category: "Utilities" });
  await expense(alice, day(3, 5), "Cooking oil", 300, { vendor: "Palengke" });
  await expense(alice, day(6, 1), "Monthly burger stall rent", 2500, { vendor: "Mall admin" });
  await sales.createSalesRecord(alice.user.id, { businessProfileId: alice.profile.id, date: day(3, 31), description: "Daily sales", amount: 5000 });
  // Another business, in a month Alice left empty: must never appear in her answers.
  await expense(mallory, day(2, 10), "Mallory generator", 9999, { vendor: "Palengke", category: "Utilities" });
});

afterAll(disconnectDb);

describe("Ask FinSight question set", () => {
  it("1. ranks each month least to greatest, from per-month totals instead of records named Monthly", async () => {
    const built = await ask(alice, `rank my monthly expense in ${year}, from least to greatest`);
    const block = section(built.context, `EXPENSES BY MONTH (${year}), lowest to highest`);

    expect(block.slice(1, 4)).toEqual([
      expect.stringContaining(`1. March ${year}: PHP 300.00 across 1 record(s)`),
      expect.stringContaining(`2. January ${year}: PHP 1,000.00 across 2 record(s)`),
      expect.stringContaining(`3. June ${year}: PHP 2,500.00 across 1 record(s)`),
    ]);
    expect(built.context).toContain(`No counted records at all in: February ${year}, April ${year}, May ${year}`);
    expect(built.context).toContain(`Total counted expenses for ${year}: PHP 3,800.00 across 4 record(s)`);
    // The old wrong answer came from this block.
    expect(built.context).not.toContain('Matching "monthly"');
    expect(built.context).not.toContain("9,999");

    expect(built.table?.rows.map((row) => [row.label, row.amount])).toEqual([
      [`March ${year}`, 300],
      [`January ${year}`, 1000],
      [`June ${year}`, 2500],
    ]);
    expect(built.table?.total).toBe(3800);
    expect(built.actions).toContainEqual(
      expect.objectContaining({ kind: "open-records", recordType: "expense", dateFrom: day(3, 1), dateTo: day(3, 31) }),
    );
    expect(built.basis).toMatchObject({ expenseRecords: 4, salesRecords: 1, from: day(1, 1), to: day(12, 31) });
    expect(built.intents).toContain("breakdown:expense:month");
  });

  it("2. names the highest month first when asked which month cost the most", async () => {
    const built = await ask(alice, `which month did I spend the most in ${year}?`);
    expect(section(built.context, `EXPENSES BY MONTH (${year}), highest first`)[1]).toContain(`1. June ${year}: PHP 2,500.00`);
  });

  it("3. compares three named months, not just the first two", async () => {
    const built = await ask(alice, `compare January, March and June ${year}`);
    const block = section(built.context, "EXPENSES BY MONTH");
    expect(block.slice(1, 4).map((line) => line.split(":")[0])).toEqual([`1. January ${year}`, `2. March ${year}`, `3. June ${year}`]);
    // Only the months asked about: the empty months between them are not listed.
    expect(built.context).not.toContain("No counted records at all in");
    expect(built.context).not.toContain("=== MONTH COMPARISON");
  });

  it("4. reads a month range as one period", async () => {
    const built = await ask(alice, `how much did I spend from January to March ${year}?`);
    expect(built.period).toBe(`January to March ${year}`);
    expect(built.context).toContain("Total recorded expenses this period: PHP 1,300.00");
  });

  it("5. totals sales by month", async () => {
    const built = await ask(alice, `what were my sales by month in ${year}?`);
    expect(section(built.context, `SALES BY MONTH (${year})`)[1]).toContain(`1. March ${year}: PHP 5,000.00 across 1 record(s)`);
  });

  it("6. lets a follow-up borrow the previous question's topic", async () => {
    const built = await ask(alice, `what about ${year}?`, { priorQuestions: ["rank my monthly expense this year, least to greatest"] });
    expect(built.context).toContain(`=== EXPENSES BY MONTH (${year}), lowest to highest ===`);
    expect(built.intents).toEqual(expect.arrayContaining(["follow-up", "breakdown:expense:month"]));
  });

  it("7. totals by week inside a month", async () => {
    const built = await ask(alice, `weekly spending in January ${year}`);
    const block = section(built.context, `EXPENSES BY WEEK (January ${year})`);
    expect(block.filter((line) => /^\d+\. Week of/.test(line))).toHaveLength(2);
  });

  it("8. leaves an ordinary question alone", async () => {
    const built = await ask(alice, `how much did I spend on rice in January ${year}?`);
    expect(built.context).not.toContain(" BY MONTH");
    expect(built.table).toBeNull();
    expect(built.context).toContain("Rice sack");
  });

  it("14. warns that expenses may be missing when sales records far outnumber them", async () => {
    for (let i = 0; i < 55; i++) {
      await sales.createSalesRecord(alice.user.id, {
        businessProfileId: alice.profile.id,
        date: day(5, 1 + (i % 28)),
        description: `Counter sale ${i}`,
        amount: 100 + i,
      });
    }
    const built = await ask(alice, `is my business thriving in ${year}?`);
    // 56 sales records beside Alice's 4 expenses; Mallory's records count for nothing here.
    expect(built.context).toContain(`- Records for ${year}: 56 sales records but only 4 counted expense records, about 14 sales records for every expense record.`);

    const quiet = await ask(mallory, `is my business thriving in ${year}?`);
    expect(quiet.context).not.toContain("=== RECORD BALANCE");
  });

  describe("lookups the model asks for", () => {
    it("9. ranks vendors from the words alone, with no planning call", async () => {
      const plan = vi.fn(async (): Promise<ToolCall[]> => []);
      const built = await ask(alice, `which vendor did I pay the most in ${year}?`, { planLookups: plan });
      expect(plan).not.toHaveBeenCalled();
      const block = section(built.context, `EXPENSES BY VENDOR (${year}), highest first`);
      expect(block[1]).toContain("1. Mall admin: PHP 2,500.00");
      expect(built.table?.rows[0]).toMatchObject({ label: "Mall admin", amount: 2500 });
      expect(built.context).not.toContain("9,999");
    });

    it("9b. runs a vendor ranking the planner asks for, for this business only", async () => {
      const plan = vi.fn(async (): Promise<ToolCall[]> => [
        { name: "expense_totals", args: { period: String(year), group_by: "vendor", order: "desc" } },
      ]);
      const built = await ask(alice, `list who I paid in ${year}`, { planLookups: plan });
      expect(plan).toHaveBeenCalledOnce();
      const block = section(built.context, `EXPENSES BY VENDOR (${year}), highest first`);
      expect(block[1]).toContain("1. Mall admin: PHP 2,500.00");
      // Palengke is 700 for Alice; Mallory's 9,999 at the same vendor name must not be added.
      expect(built.context).toContain("Palengke: PHP 700.00 across 2 record(s)");
      expect(built.context).not.toContain("9,999");
      expect(built.intents).toContain("tool:expense_totals:vendor");
    });

    it("10. filters records by category and amount, with a button to open them", async () => {
      const plan = async (): Promise<ToolCall[]> => [
        { name: "find_records", args: { record_type: "expense", period: String(year), category: "utilities", sort: "newest" } },
        { name: "find_records", args: { record_type: "expense", period: String(year), min_amount: 1000, sort: "largest" } },
      ];
      const built = await ask(alice, `list my utilities expenses in ${year}`, { planLookups: plan });
      expect(built.context).toContain("Matching counted expense records: 1 record(s) totalling PHP 600.00");
      expect(built.context).toContain('"Monthly electricity and water" PHP 600.00');
      expect(built.context).toContain('"Monthly burger stall rent" PHP 2,500.00');
      expect(built.context).not.toContain("Mallory generator");
      expect(built.references.size).toBeGreaterThanOrEqual(2);
      expect(built.actions).toContainEqual(
        expect.objectContaining({ kind: "open-records", categoryId: alice.categories.Utilities, dateFrom: day(1, 1) }),
      );
    });

    it("11. compares two periods the fixed blocks do not cover", async () => {
      const plan = async (): Promise<ToolCall[]> => [
        { name: "compare_periods", args: { first: `Q1 ${year}`, second: `Q2 ${year}` } },
      ];
      const built = await ask(alice, `compare my first and second quarter of ${year}`, { planLookups: plan });
      expect(built.context).toContain(`- Total counted expenses in Q1 ${year} (January to March ${year}): PHP 1,300.00`);
      expect(built.context).toContain(`- Total counted expenses in Q2 ${year} (April to June ${year}): PHP 2,500.00`);
      expect(built.context).toContain("change from");
    });

    it("12. skips a lookup whose period it cannot read, and survives a failing planner", async () => {
      const unreadable = await ask(alice, "list my expenses", {
        planLookups: async () => [{ name: "expense_totals", args: { period: "the good old days", group_by: "vendor", order: "desc" } }],
      });
      expect(unreadable.context).toContain('could not read the period "the good old days"');

      await expect(ask(alice, "list my expenses", { planLookups: async () => [] })).resolves.toBeTruthy();
    });

    it("13. spends no planning call on small talk, a breakdown, or a what-if", async () => {
      const plan = vi.fn(async (): Promise<ToolCall[]> => []);
      await ask(alice, "hello Fin", { planLookups: plan });
      await ask(alice, `rank my monthly expense in ${year}`, { planLookups: plan });
      await ask(alice, "what if I buy a 12,000 fridge?", { planLookups: plan });
      expect(plan).not.toHaveBeenCalled();
    });
  });
});
