import { prisma } from "../config/prisma";
import { requireOwnedBusinessProfile } from "../lib/ownership";
import { listNotifications } from "./notification.service";
import { loadRecoveryTargets } from "./insights.service";
import { utcAddDays, utcEndOfDay, utcToday } from "../lib/dates";

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
