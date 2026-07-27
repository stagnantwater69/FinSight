import { prisma } from "../config/prisma";
import type { BusinessProfile } from "@prisma/client";
import { requireOwnedBusinessProfile } from "../lib/ownership";
import {
  computeCategoryStats,
  computeRecoveryTarget,
  dayStatus,
  impactBand,
  isUnusualExpense,
  zScore,
  MIN_HISTORY_FOR_DETECTION,
  type RecoveryTargets,
} from "./analysis.service";

// All day boundaries are UTC — record dates are date-only values stored at
// UTC midnight, so local-time boundaries drop or double-count the edge days.
// See lib/dates.ts.
import {
  utcAddDays,
  utcDateKey,
  utcDayOfMonth,
  utcEndOfDay,
  utcStartOfMonth,
  utcToday,
} from "../lib/dates";

// ============================================================
// Recovery targets — the single fetch+compute path
// ============================================================
//
// Both the Dashboard summary and the Insights Recovery Target screen call
// this. Do not recompute any of these numbers in either caller; if a
// caller needs another figure, add it here.
export async function loadRecoveryTargets(profile: BusinessProfile, today: Date): Promise<RecoveryTargets> {
  const monthStart = utcStartOfMonth(today);
  const endOfToday = utcEndOfDay(today);

  const [monthAgg, todayAgg] = await Promise.all([
    prisma.salesReferenceRecord.aggregate({
      where: { businessProfileId: profile.id, date: { gte: monthStart, lte: endOfToday } },
      _sum: { amount: true },
    }),
    prisma.salesReferenceRecord.aggregate({
      where: { businessProfileId: profile.id, date: { gte: today, lte: endOfToday } },
      _sum: { amount: true },
    }),
  ]);

  return computeRecoveryTarget({
    expectedMonthlyExpenses: Number(profile.expectedMonthlyExpenses),
    operatingDays: profile.operatingDays,
    salesThisMonth: Number(monthAgg._sum.amount ?? 0),
    salesToday: Number(todayAgg._sum.amount ?? 0),
    today,
  });
}

// ============================================================
// Expense Behavior Analysis
// ============================================================

export async function getExpenseBehavior(userId: number, businessProfileId: number, periodDays: number) {
  await requireOwnedBusinessProfile(userId, businessProfileId);

  const today = utcToday();
  const periodStart = utcAddDays(today, -(periodDays - 1));
  const previousPeriodEnd = utcAddDays(periodStart, -1);
  const previousPeriodStart = utcAddDays(previousPeriodEnd, -(periodDays - 1));

  const [currentRecords, previousRecords, allCategoryRecords, categories] = await Promise.all([
    prisma.expenseRecord.findMany({
      where: { businessProfileId, date: { gte: periodStart, lte: utcEndOfDay(today) } },
    }),
    prisma.expenseRecord.findMany({
      where: { businessProfileId, date: { gte: previousPeriodStart, lte: previousPeriodEnd } },
      select: { categoryId: true, amount: true },
    }),
    prisma.expenseRecord.findMany({
      where: { businessProfileId },
      select: { id: true, categoryId: true, amount: true },
    }),
    prisma.expenseCategory.findMany({ where: { businessProfileId } }),
  ]);

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const currentTotals = new Map<number, number>();
  // How many expenses make up each category's total. A category can be large
  // because of one big purchase or because of forty small ones, and those are
  // completely different problems — the count is what tells them apart.
  const currentCounts = new Map<number, number>();
  for (const r of currentRecords) {
    currentTotals.set(r.categoryId, (currentTotals.get(r.categoryId) ?? 0) + Number(r.amount));
    currentCounts.set(r.categoryId, (currentCounts.get(r.categoryId) ?? 0) + 1);
  }
  const previousTotals = new Map<number, number>();
  for (const r of previousRecords) previousTotals.set(r.categoryId, (previousTotals.get(r.categoryId) ?? 0) + Number(r.amount));

  const categoryIds = new Set([...currentTotals.keys(), ...previousTotals.keys()]);
  const categoryTrends = [...categoryIds]
    .map((categoryId) => {
      const current = currentTotals.get(categoryId) ?? 0;
      const previous = previousTotals.get(categoryId) ?? 0;
      const direction: "up" | "down" | "flat" = current > previous ? "up" : current < previous ? "down" : "flat";
      // null = "new spending this period, no prior baseline to compare against" —
      // distinct from 0%, which means genuinely unchanged.
      const percentChange = previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? null : 0;
      return {
        categoryId,
        categoryName: categoryName.get(categoryId) ?? "Unknown",
        current,
        previous,
        direction,
        percentChange,
        recordCount: currentCounts.get(categoryId) ?? 0,
        // The absolute peso movement, alongside the percentage. A 300% rise on
        // a PHP 200 category is a rounding error; a 12% rise on rent is not.
        // Percent alone routinely puts the first at the top of a "biggest
        // change" list and buries the second.
        change: current - previous,
      };
    })
    .sort((a, b) => b.current - a.current);

  // ============================================================
  // Period totals
  // ============================================================
  // Summed here rather than in the client so every surface that shows "total
  // expenses this period" reads the same number. The share percentages on the
  // client all divide by `totals.current`, which is what keeps the donut and
  // the summary table from disagreeing.
  const totalCurrent = [...currentTotals.values()].reduce((s, v) => s + v, 0);
  const totalPrevious = [...previousTotals.values()].reduce((s, v) => s + v, 0);

  // ============================================================
  // Daily spend series
  // ============================================================
  // Answers "when does the money actually leave?" — the question a category
  // breakdown cannot. Every day in the period is emitted, including the ones
  // with no spending: dropping empty days would silently compress the x-axis
  // and turn a quiet fortnight into a flat line that looks like steady
  // spending.
  const dailyMap = new Map<string, { total: number; count: number }>();
  for (let i = 0; i < periodDays; i++) {
    dailyMap.set(utcDateKey(utcAddDays(periodStart, i)), { total: 0, count: 0 });
  }
  for (const r of currentRecords) {
    const key = utcDateKey(r.date);
    const entry = dailyMap.get(key);
    if (entry) {
      entry.total += Number(r.amount);
      entry.count += 1;
    }
  }
  const dailyTotals = [...dailyMap.entries()].map(([date, v]) => ({
    date,
    total: v.total,
    count: v.count,
  }));

  // Unusual-expense detection: leave-one-out Z-score against each
  // category's full historical amount list (all-time, not period-scoped
  // — more data makes a better baseline), evaluated only for records that
  // fall in the current period.
  const byCategory = new Map<number, { id: number; amount: number }[]>();
  for (const r of allCategoryRecords) {
    const list = byCategory.get(r.categoryId) ?? [];
    list.push({ id: r.id, amount: Number(r.amount) });
    byCategory.set(r.categoryId, list);
  }
  const currentRecordById = new Map(currentRecords.map((r) => [r.id, r]));

  const unusualExpenses: {
    id: number;
    description: string;
    amount: number;
    date: Date;
    categoryId: number;
    categoryName: string;
    zScore: number;
    categoryMean: number;
    categoryStdDev: number;
  }[] = [];
  const insufficientHistoryCategories: { categoryId: number; categoryName: string; historyCount: number }[] = [];

  for (const [categoryId, records] of byCategory) {
    if (records.length < MIN_HISTORY_FOR_DETECTION) {
      insufficientHistoryCategories.push({
        categoryId,
        categoryName: categoryName.get(categoryId) ?? "Unknown",
        historyCount: records.length,
      });
      continue;
    }

    for (const candidate of records) {
      const currentRecord = currentRecordById.get(candidate.id);
      if (!currentRecord) continue; // only flag within the selected period

      const baseline = records.filter((r) => r.id !== candidate.id).map((r) => r.amount);
      const stats = computeCategoryStats(baseline);
      const z = zScore(candidate.amount, stats);

      // Statistically unusual AND materially different in peso terms — see
      // isUnusualExpense. The z-score alone over-reported trivial differences
      // on tightly-clustered categories.
      if (isUnusualExpense(candidate.amount, stats)) {
        unusualExpenses.push({
          id: candidate.id,
          description: currentRecord.description,
          amount: candidate.amount,
          date: currentRecord.date,
          categoryId,
          categoryName: categoryName.get(categoryId) ?? "Unknown",
          zScore: z,
          categoryMean: stats.mean,
          categoryStdDev: stats.stdDev,
        });
      }
    }
  }
  unusualExpenses.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));

  return {
    periodStart,
    periodEnd: today,
    previousPeriodStart,
    previousPeriodEnd,
    periodDays,
    totals: { current: totalCurrent, previous: totalPrevious },
    dailyTotals,
    categoryTrends,
    unusualExpenses,
    insufficientHistoryCategories,
  };
}

// ============================================================
// Target-Based Recovery Insight
// ============================================================

export async function getRecoveryInsight(userId: number, businessProfileId: number, coverageDays: number) {
  const profile = await requireOwnedBusinessProfile(userId, businessProfileId);

  const today = utcToday();
  const targets = await loadRecoveryTargets(profile, today);

  // Daily coverage table — "recent days" per the mockup. Scoped to the
  // current month, since a day before the 1st belongs to a different
  // month's target and would be misleading in this table.
  const monthStart = utcStartOfMonth(today);
  const daysElapsedThisMonth = utcDayOfMonth(today);
  const coverageStart = utcAddDays(today, -(Math.min(coverageDays, daysElapsedThisMonth) - 1));
  const endOfToday = utcEndOfDay(today);

  const coverageRecords = await prisma.salesReferenceRecord.findMany({
    where: { businessProfileId, date: { gte: coverageStart, lte: endOfToday } },
    select: { date: true, amount: true },
  });

  const salesByDay = new Map<string, number>();
  for (const r of coverageRecords) {
    const key = utcDateKey(r.date);
    salesByDay.set(key, (salesByDay.get(key) ?? 0) + Number(r.amount));
  }

  const dailyCoverage: {
    date: string;
    neededTarget: number;
    sales: number;
    gap: number;
    status: ReturnType<typeof dayStatus>;
  }[] = [];
  for (let d = new Date(coverageStart); d <= today; d = utcAddDays(d, 1)) {
    const key = utcDateKey(d);
    const sales = salesByDay.get(key) ?? 0;
    dailyCoverage.push({
      date: key,
      neededTarget: targets.dailyNeededTarget,
      sales,
      gap: sales - targets.dailyNeededTarget,
      status: dayStatus(sales, targets.dailyNeededTarget),
    });
  }

  return {
    ...targets,
    monthStart,
    today,
    coverageDays: dailyCoverage.length,
    dailyCoverage,
  };
}

// ============================================================
// Spending-Impact Assessment (pure calculation, nothing persisted)
// ============================================================

export async function simulateSpendingImpact(
  userId: number,
  businessProfileId: number,
  plannedAmount: number,
  periodDays = 30
) {
  const profile = await requireOwnedBusinessProfile(userId, businessProfileId);

  const today = utcToday();
  const periodStart = utcAddDays(today, -(periodDays - 1));
  const endOfToday = utcEndOfDay(today);

  const expenseAgg = await prisma.expenseRecord.aggregate({
    where: { businessProfileId, date: { gte: periodStart, lte: endOfToday } },
    _sum: { amount: true },
  });

  const availableFunds = Number(profile.availableFunds);
  const resultingFunds = availableFunds - plannedAmount;
  const percentOfFunds = availableFunds > 0 ? (plannedAmount / availableFunds) * 100 : plannedAmount > 0 ? Infinity : 0;
  const exceedsFunds = plannedAmount > availableFunds;

  // Threshold base differs by context, deliberately: Records flags a large
  // expense against Expected Monthly Expenses (is this big for my cost
  // base?), while this simulator measures it against Available Business
  // Funds (can I absorb this right now?). Same configurable percentage
  // either way — see A2 in the build notes.
  const thresholdPercent = Number(profile.largeExpenseThresholdPercent);

  const currentPeriodExpenses = Number(expenseAgg._sum.amount ?? 0);
  const updatedPeriodExpenses = currentPeriodExpenses + plannedAmount;

  return {
    periodDays,
    periodStart,
    periodEnd: today,
    plannedAmount,
    thresholdPercent,
    thresholdAmount: availableFunds * (thresholdPercent / 100),
    // Infinity is possible here (zero funds, nonzero spend); the
    // controller caps it, since JSON has no Infinity.
    percentOfFunds,
    impactBand: Number.isFinite(percentOfFunds)
      ? impactBand(percentOfFunds, thresholdPercent)
      : ("High Impact" as const),
    exceedsFunds,
    funds: { before: availableFunds, after: resultingFunds },
    periodExpenses: { before: currentPeriodExpenses, after: updatedPeriodExpenses },
    // Retained for the existing callers that read these flat names.
    availableFunds,
    resultingFunds,
  };
}
