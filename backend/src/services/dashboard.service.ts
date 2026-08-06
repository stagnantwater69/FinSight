import { prisma } from "../config/prisma";
import { requireOwnedBusinessProfile } from "../lib/ownership";
import { listNotifications } from "./notification.service";
import { loadRecoveryTargets } from "./insights.service";
import { utcAddDays, utcDateKey, utcEndOfDay, utcMonthKey, utcToday } from "../lib/dates";

export async function getDashboardSummary(userId: number, businessProfileId: number, periodDays: number) {
  const profile = await requireOwnedBusinessProfile(userId, businessProfileId);

  const today = utcToday();
  const startDate = utcAddDays(today, -(periodDays - 1));

  // Upper bound is the END of today, not its midnight: a record dated today
  // is stored at 00:00:00.000Z, and an `lte: midnight` bound was excluding
  // every record dated today on any server not running in UTC.
  const dateFilter = { gte: startDate, lte: utcEndOfDay(today) };

  const [expenseRecords, salesAgg, reviewCounts, alerts, recoveryStatus] = await Promise.all([
    prisma.expenseRecord.findMany({
      where: { businessProfileId, date: dateFilter },
      include: { category: true },
    }),
    prisma.salesReferenceRecord.aggregate({
      where: { businessProfileId, date: dateFilter },
      _sum: { amount: true },
    }),
    Promise.all([
      prisma.expenseRecord.count({
        where: { businessProfileId, OR: [{ reviewStatus: "Needs Review" }, { duplicateStatus: "Flagged" }] },
      }),
      prisma.salesReferenceRecord.count({
        where: { businessProfileId, OR: [{ reviewStatus: "Needs Review" }, { duplicateStatus: "Flagged" }] },
      }),
    ]),
    listNotifications(userId, businessProfileId),
    // Recovery is deliberately NOT scoped to the dashboard's period
    // selector — it's a month-to-date tracker, so it reads the same
    // whether the user is looking at Today, This week, or This month.
    loadRecoveryTargets(profile, today),
  ]);

  const totalExpenses = expenseRecords.reduce((sum, r) => sum + Number(r.amount), 0);
  const totalSalesReference = Number(salesAgg._sum.amount ?? 0);
  const recordsNeedingReview = reviewCounts[0] + reviewCounts[1];

  const categoryTotals = new Map<number, { name: string; total: number }>();
  for (const r of expenseRecords) {
    const existing = categoryTotals.get(r.categoryId);
    const amount = Number(r.amount);
    if (existing) {
      existing.total += amount;
    } else {
      categoryTotals.set(r.categoryId, { name: r.category.name, total: amount });
    }
  }
  const expenseCategoryBreakdown = [...categoryTotals.entries()]
    .map(([categoryId, { name, total }]) => ({
      categoryId,
      categoryName: name,
      total,
      percent: totalExpenses > 0 ? (total / totalExpenses) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    periodDays,
    periodStart: startDate,
    periodEnd: today,
    overview: {
      availableFunds: Number(profile.availableFunds),
      totalExpenses,
      totalSalesReference,
    },
    expenseCategoryBreakdown,
    recoveryStatus,
    recordsNeedingReview,
    alerts: alerts.slice(0, 10),
  };
}

export type CashflowGranularity = "daily" | "monthly";

export interface CashflowPoint {
  date: string;
  sales: number;
  expenses: number;
}

/** One point per day, over a week — enough to read as a trend without the axis crowding on a phone. */
const CASHFLOW_DAYS = 7;
/** One point per calendar month, over half a year — same reasoning, at the monthly scale. */
const CASHFLOW_MONTHS = 6;

/**
 * Money in vs money out, one row per day or per calendar month depending on
 * `granularity` — Home's cashflow chart. Independent of the dashboard
 * summary's period selector above; the chart has its own fixed windows.
 *
 * Zero-filled: a bucket with no records still gets a row, so the chart's
 * line has one point per day/month rather than a gap that reads as missing
 * data. Grouped by `utcDateKey`/`utcMonthKey`, the same helpers
 * `getDashboardSummary`'s documented UTC bug fix relies on — a record dated
 * today must land in today's bucket regardless of the server's local
 * timezone.
 */
export async function getDashboardCashflow(
  userId: number,
  businessProfileId: number,
  granularity: CashflowGranularity = "daily",
): Promise<{ granularity: CashflowGranularity; points: CashflowPoint[] }> {
  await requireOwnedBusinessProfile(userId, businessProfileId);

  const today = utcToday();

  if (granularity === "monthly") {
    const startMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (CASHFLOW_MONTHS - 1), 1));
    const dateFilter = { gte: startMonth, lte: utcEndOfDay(today) };

    const [expenseRecords, salesRecords] = await Promise.all([
      prisma.expenseRecord.findMany({ where: { businessProfileId, date: dateFilter }, select: { date: true, amount: true } }),
      prisma.salesReferenceRecord.findMany({
        where: { businessProfileId, date: dateFilter },
        select: { date: true, amount: true },
      }),
    ]);

    const byMonth = new Map<string, CashflowPoint>();
    for (let i = 0; i < CASHFLOW_MONTHS; i++) {
      const key = utcMonthKey(new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() + i, 1)));
      byMonth.set(key, { date: key, sales: 0, expenses: 0 });
    }
    for (const r of expenseRecords) byMonth.get(utcMonthKey(r.date))!.expenses += Number(r.amount);
    for (const r of salesRecords) byMonth.get(utcMonthKey(r.date))!.sales += Number(r.amount);

    return { granularity, points: [...byMonth.values()] };
  }

  const startDate = utcAddDays(today, -(CASHFLOW_DAYS - 1));
  const dateFilter = { gte: startDate, lte: utcEndOfDay(today) };

  const [expenseRecords, salesRecords] = await Promise.all([
    prisma.expenseRecord.findMany({ where: { businessProfileId, date: dateFilter }, select: { date: true, amount: true } }),
    prisma.salesReferenceRecord.findMany({
      where: { businessProfileId, date: dateFilter },
      select: { date: true, amount: true },
    }),
  ]);

  const byDay = new Map<string, CashflowPoint>();
  for (let i = 0; i < CASHFLOW_DAYS; i++) {
    const key = utcDateKey(utcAddDays(startDate, i));
    byDay.set(key, { date: key, sales: 0, expenses: 0 });
  }
  for (const r of expenseRecords) byDay.get(utcDateKey(r.date))!.expenses += Number(r.amount);
  for (const r of salesRecords) byDay.get(utcDateKey(r.date))!.sales += Number(r.amount);

  return { granularity, points: [...byDay.values()] };
}
