import type { BusinessProfile } from "@prisma/client";
import { prisma } from "../config/prisma";
import { utcAddDays, utcDateKey, utcIsoWeekday } from "../lib/dates";
import { resolveReportingWindow, windowDateFilter, type PeriodSelection } from "../lib/reportingPeriod";
import { COUNTED_EXPENSE } from "./financialPosition.service";

/**
 * Totals grouped by month, week, category or vendor, for Ask FinSight.
 *
 * "Rank my monthly expense this year" used to reach the model with only the
 * year's total, so it ranked two records that happened to contain the word
 * "monthly". Every figure here is summed by the database with the same
 * counted-expense rule as the period totals, so a month-by-month list adds up
 * to the year total the owner sees elsewhere. The model only puts it in words.
 */

export type GroupBy = "month" | "week" | "category" | "vendor";
export type Order = "asc" | "desc" | "chronological";

export interface Bucket {
  /** Sort key: YYYY-MM, a week's Monday, or the category/vendor name. */
  key: string;
  label: string;
  amount: number;
  count: number;
  /** The month or week is still in progress. */
  partial: boolean;
  /** Set for a category bucket, so a button can filter Records by it. */
  categoryId?: number;
}

export interface Breakdown {
  subject: "expense" | "sales";
  groupBy: GroupBy;
  order: Order;
  periodLabel: string;
  /** The rows to rank: buckets with at least one counted record. */
  rows: Bucket[];
  /** Months or weeks in the span with no counted records at all. */
  empty: Bucket[];
  total: number;
  count: number;
  /** First and last day covered, YYYY-MM-DD. */
  from: string | null;
  to: string;
}

/** A grouped list the clients draw under the answer. Built from a Breakdown, never from model text. */
export interface AnswerTable {
  title: string;
  /** What each row's amount is, e.g. "Expenses". */
  valueLabel: string;
  rows: { label: string; amount: number; count: number; note?: string }[];
  total: number;
}

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MAX_BUCKETS = 36;
const MAX_NAMED_GROUPS = 15;

function peso(n: number): string {
  return `PHP ${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const monthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key: string) => {
  const [year, month] = key.split("-").map(Number) as [number, number];
  return `${MONTH_LABELS[month - 1]} ${year}`;
};
const weekStart = (date: Date) => utcAddDays(date, -(utcIsoWeekday(date) - 1));
const weekLabel = (start: Date) => `Week of ${utcDateKey(start)}`;

/** Every month or week from `start` to `end`, so a quiet one shows as empty instead of vanishing. */
function calendarKeys(groupBy: "month" | "week", start: Date, end: Date): string[] {
  const keys: string[] = [];
  if (groupBy === "month") {
    for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); d <= end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      keys.push(monthKey(d));
    }
  } else {
    for (let d = weekStart(start); d <= end; d = utcAddDays(d, 7)) keys.push(utcDateKey(d));
  }
  return keys;
}

function sortRows(rows: Bucket[], order: Order): Bucket[] {
  const sorted = [...rows];
  if (order === "asc") sorted.sort((a, b) => a.amount - b.amount || a.key.localeCompare(b.key));
  else if (order === "desc") sorted.sort((a, b) => b.amount - a.amount || a.key.localeCompare(b.key));
  else sorted.sort((a, b) => a.key.localeCompare(b.key));
  return sorted;
}

export interface BreakdownRequest {
  subject: "expense" | "sales";
  groupBy: GroupBy;
  order: Order;
  selection: PeriodSelection;
  periodLabel: string;
  /** Keep only these YYYY-MM months ("January, March and June"). */
  onlyMonths?: string[];
}

/**
 * One owner-scoped grouped read. `profile` always comes from the session, never
 * from a model or a request body: every query below is filtered by its id.
 */
export async function loadBreakdown(profile: BusinessProfile, today: Date, request: BreakdownRequest): Promise<Breakdown> {
  const window = resolveReportingWindow(request.selection, today);
  const dateFilter = windowDateFilter(window, today);
  const base = { businessProfileId: profile.id, date: dateFilter };
  const groupBy = request.groupBy;
  const sales = request.subject === "sales";
  // Sales carry no category or vendor.
  if (sales && (groupBy === "category" || groupBy === "vendor")) {
    throw new Error("Sales cannot be grouped by category or vendor");
  }

  let buckets: Bucket[];
  let empty: Bucket[] = [];
  let first: Date | null = window.start;
  const last = window.end && window.end < today ? window.end : today;

  if (groupBy === "month" || groupBy === "week") {
    // Grouped by day in the database, then folded into months or weeks here:
    // at most one row per calendar day, whatever the record count.
    const days = sales
      ? await prisma.salesReferenceRecord.groupBy({ by: ["date"], where: base, _sum: { amount: true }, _count: { _all: true } })
      : await prisma.expenseRecord.groupBy({ by: ["date"], where: { ...base, ...COUNTED_EXPENSE }, _sum: { amount: true }, _count: { _all: true } });
    const folded = new Map<string, { amount: number; count: number }>();
    for (const day of days) {
      const key = groupBy === "month" ? monthKey(day.date) : utcDateKey(weekStart(day.date));
      const entry = folded.get(key) ?? { amount: 0, count: 0 };
      entry.amount += Number(day._sum.amount ?? 0);
      entry.count += day._count._all;
      folded.set(key, entry);
    }
    if (!first) {
      // All time starts at the first month (or week) with a record.
      const earliest = days.reduce<Date | null>((min, day) => (!min || day.date < min ? day.date : min), null);
      first = earliest;
    }
    const keys = first ? calendarKeys(groupBy, first, last) : [];
    const currentKey = groupBy === "month" ? monthKey(today) : utcDateKey(weekStart(today));
    const all = keys.map((key) => {
      const entry = folded.get(key) ?? { amount: 0, count: 0 };
      // The current month or week, when the window reaches today.
      const partial = key === currentKey && last >= today;
      return {
        key,
        label: groupBy === "month" ? monthLabel(key) : weekLabel(new Date(`${key}T00:00:00Z`)),
        amount: entry.amount,
        count: entry.count,
        partial,
      };
    });
    const wanted = request.onlyMonths && groupBy === "month" ? new Set(request.onlyMonths) : null;
    const kept = (wanted ? all.filter((bucket) => wanted.has(bucket.key)) : all).slice(-MAX_BUCKETS);
    buckets = kept.filter((bucket) => bucket.count > 0);
    empty = kept.filter((bucket) => bucket.count === 0);
  } else if (groupBy === "category") {
    const rows = await prisma.expenseRecord.groupBy({
      by: ["categoryId"],
      where: { ...base, ...COUNTED_EXPENSE },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const ids = rows.map((row) => row.categoryId).filter((id): id is number => id !== null);
    const names = new Map(
      (await prisma.expenseCategory.findMany({ where: { businessProfileId: profile.id, id: { in: ids } }, select: { id: true, name: true } }))
        .map((category) => [category.id, category.name]),
    );
    buckets = rows.map((row) => ({
      key: row.categoryId === null ? "Uncategorised" : names.get(row.categoryId) ?? "Unnamed category",
      label: row.categoryId === null ? "Uncategorised" : names.get(row.categoryId) ?? "Unnamed category",
      amount: Number(row._sum.amount ?? 0),
      count: row._count._all,
      partial: false,
      ...(row.categoryId !== null ? { categoryId: row.categoryId } : {}),
    }));
  } else {
    const rows = await prisma.expenseRecord.groupBy({
      by: ["vendor"],
      where: { ...base, ...COUNTED_EXPENSE },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const merged = new Map<string, Bucket>();
    for (const row of rows) {
      const name = row.vendor?.trim() || "No vendor recorded";
      const bucket = merged.get(name) ?? { key: name, label: name, amount: 0, count: 0, partial: false };
      bucket.amount += Number(row._sum.amount ?? 0);
      bucket.count += row._count._all;
      merged.set(name, bucket);
    }
    buckets = [...merged.values()];
  }

  const total = buckets.reduce((sum, bucket) => sum + bucket.amount, 0);
  const count = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const order = request.order === "chronological" && (groupBy === "category" || groupBy === "vendor") ? "desc" : request.order;
  return {
    subject: request.subject,
    groupBy,
    order,
    periodLabel: request.periodLabel,
    rows: sortRows(buckets, order),
    empty,
    // Rounded once, here, so the total line and the table agree to the centavo.
    total: Math.round(total * 100) / 100,
    count,
    from: first ? utcDateKey(first) : null,
    to: utcDateKey(last),
  };
}

const ORDER_PHRASE: Record<Order, string> = {
  asc: "lowest to highest",
  desc: "highest first",
  chronological: "in calendar order",
};
const GROUP_NOUN: Record<GroupBy, string> = { month: "MONTH", week: "WEEK", category: "CATEGORY", vendor: "VENDOR" };

/**
 * One figure per line, subject first: the answer check binds each figure to
 * the words before it, so "3. March 2026: PHP 1,200.00" can only be quoted as
 * March's total.
 */
export function breakdownLines(breakdown: Breakdown): string[] {
  const noun = breakdown.subject === "sales" ? "SALES" : "EXPENSES";
  const lines = [
    "",
    `=== ${noun} BY ${GROUP_NOUN[breakdown.groupBy]} (${breakdown.periodLabel}), ${ORDER_PHRASE[breakdown.order]} ===`,
  ];
  if (breakdown.rows.length === 0) {
    lines.push(`No counted ${breakdown.subject === "sales" ? "sales" : "expense"} records in ${breakdown.periodLabel}, so there is nothing to rank.`);
    return lines;
  }
  const shown = breakdown.groupBy === "category" || breakdown.groupBy === "vendor" ? breakdown.rows.slice(0, MAX_NAMED_GROUPS) : breakdown.rows;
  shown.forEach((row, index) => {
    lines.push(`${index + 1}. ${row.label}${row.partial ? " (still in progress)" : ""}: ${peso(row.amount)} across ${row.count} record(s)`);
  });
  if (breakdown.rows.length > shown.length) lines.push(`- ${breakdown.rows.length - shown.length} smaller group(s) not listed.`);
  for (const row of breakdown.rows.filter((r) => r.partial)) {
    lines.push(`- ${row.label} is not over yet (up to ${breakdown.to}), so its total may still rise.`);
  }
  if (breakdown.empty.length > 0) {
    lines.push(
      `- No counted records at all in: ${breakdown.empty.map((row) => row.label).join(", ")}. ` +
        "Left out of the ranking: no records usually means nothing was recorded, not that nothing was spent.",
    );
  }
  lines.push(
    `- Total ${breakdown.subject === "sales" ? "sales" : "counted expenses"} for ${breakdown.periodLabel}: ${peso(breakdown.total)} across ${breakdown.count} record(s)`,
    "FinSight calculated each total above. Keep this order and these figures; do not add, average or re-rank them yourself.",
  );
  return lines;
}

export function breakdownTable(breakdown: Breakdown): AnswerTable | null {
  if (breakdown.rows.length < 2) return null;
  const noun = breakdown.subject === "sales" ? "Sales" : "Expenses";
  const group = breakdown.groupBy === "category" ? "category" : breakdown.groupBy;
  return {
    title: `${noun} by ${group}, ${breakdown.periodLabel} (${ORDER_PHRASE[breakdown.order]})`,
    valueLabel: noun,
    rows: breakdown.rows.slice(0, MAX_BUCKETS).map((row) => ({
      label: row.label,
      amount: Math.round(row.amount * 100) / 100,
      count: row.count,
      ...(row.partial ? { note: "In progress" } : {}),
    })),
    total: breakdown.total,
  };
}

/** The first day and last day a bucket covers, for a "show these records" button. */
export function bucketDates(breakdown: Breakdown, bucket: Bucket): { dateFrom: string; dateTo: string } | null {
  if (breakdown.groupBy === "month") {
    const [year, month] = bucket.key.split("-").map(Number) as [number, number];
    const end = new Date(Date.UTC(year, month, 0));
    return { dateFrom: `${bucket.key}-01`, dateTo: utcDateKey(end < new Date(`${breakdown.to}T00:00:00Z`) ? end : new Date(`${breakdown.to}T00:00:00Z`)) };
  }
  if (breakdown.groupBy === "week") {
    const start = new Date(`${bucket.key}T00:00:00Z`);
    return { dateFrom: bucket.key, dateTo: utcDateKey(utcAddDays(start, 6)) };
  }
  return breakdown.from ? { dateFrom: breakdown.from, dateTo: breakdown.to } : null;
}
