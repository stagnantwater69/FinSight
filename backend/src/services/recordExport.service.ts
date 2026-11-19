import type { ExpenseRecordSource, SalesRecordSource } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../middleware/error.middleware";
import { requireOwnedBusinessProfile } from "../lib/ownership";
import { utcDateKey } from "../lib/dates";
import { CSV_BOM, csvRow, csvRowWithAmount } from "../lib/csv";
import { searchExpenseWhere } from "./expenseRecord.service";
import { searchSalesWhere } from "./salesRecord.service";

/**
 * The most rows one export may hold: what a spreadsheet can open. Excel stops
 * at 1,048,576 rows, header included, and this stays under that. Rows are
 * written to the response as they are read (see `prepareRecordsExport`), so
 * memory no longer sets the cap; it used to be 50,000 because the whole file
 * was built before the first byte went out.
 */
export const MAX_EXPORT_ROWS = 1_000_000;
const PAGE_SIZE = 1_000;

export const EXPORT_HEADER = ["Date", "Type", "Description", "Vendor", "Category", "Amount", "Source", "Review status"];

const SOURCE_LABEL: Record<ExpenseRecordSource | SalesRecordSource, string> = {
  MANUAL_ENTRY: "Manual Entry",
  CSV_UPLOAD: "CSV Upload",
  RECEIPT_SCAN: "Receipt Scan",
};

export interface ExportFilters {
  businessProfileId: number;
  type: "expense" | "sales" | "all";
  categoryId?: number;
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  source?: ExpenseRecordSource;
  importBatchId?: number;
  /**
   * Whole calendar months ("YYYY-MM"), any combination, gaps allowed. Applied
   * on top of dateFrom/dateTo, so both narrow the file when both are given.
   */
  months?: string[];
}

/** First and last day of a "YYYY-MM" month, as UTC dates (record dates are stored at UTC midnight). */
function monthRange(month: string): { gte: Date; lte: Date } {
  const [year, monthNumber] = month.split("-").map(Number);
  return { gte: new Date(Date.UTC(year!, monthNumber! - 1, 1)), lte: new Date(Date.UTC(year!, monthNumber!, 0)) };
}

export interface ExportMonth {
  month: string;
  expenses: number;
  sales: number;
}

/**
 * Every month that holds a record, newest first, with how many of each kind.
 * Unlike /records/months this includes future-dated records, because the
 * export includes them too; the counts are what the file will hold.
 */
export async function listExportMonths(userId: number, businessProfileId: number): Promise<ExportMonth[]> {
  await requireOwnedBusinessProfile(userId, businessProfileId);
  const rows = await prisma.$queryRaw<{ month: string; expenses: number; sales: number }[]>`
    WITH counts AS (
      SELECT to_char("ExpenseRecord_Date", 'YYYY-MM') AS month, count(*)::int AS expenses, 0 AS sales
      FROM "ExpenseRecord" WHERE "BusinessProfile_ID" = ${businessProfileId}
      GROUP BY 1
      UNION ALL
      SELECT to_char("SalesReferenceRecord_Date", 'YYYY-MM') AS month, 0 AS expenses, count(*)::int AS sales
      FROM "SalesReferenceRecord" WHERE "BusinessProfile_ID" = ${businessProfileId}
      GROUP BY 1
    )
    SELECT month, sum(expenses)::int AS expenses, sum(sales)::int AS sales
    FROM counts GROUP BY month ORDER BY month DESC
  `;
  return rows.map((row) => ({ month: row.month, expenses: Number(row.expenses), sales: Number(row.sales) }));
}

type Line = { date: Date; kind: 0 | 1; id: number; csv: string };

export interface PreparedExport {
  /** The file in chunks: BOM and header first, then rows oldest first. */
  chunks: () => AsyncGenerator<string>;
}

/**
 * Checks ownership and size up front, so a refusal is still a JSON error, then
 * hands back a reader that streams the file. Same filter semantics as
 * /records/search, so the file matches the list the owner was looking at.
 */
export async function prepareRecordsExport(userId: number, filters: ExportFilters): Promise<PreparedExport> {
  await requireOwnedBusinessProfile(userId, filters.businessProfileId);

  const includeExpenses = filters.type !== "sales";
  // Sales have no category and are never receipt scans; see records.controller search.
  const includeSales = filters.type !== "expense" && filters.source !== "RECEIPT_SCAN" && filters.categoryId === undefined;
  // The where-builders use AND for the date window and never OR, so the month
  // list can sit beside it as its own OR without changing what they select.
  const inMonths = filters.months?.length ? { OR: filters.months.map((month) => ({ date: monthRange(month) })) } : {};
  const expenseWhere = { ...searchExpenseWhere(filters), ...inMonths };
  const salesWhere = {
    ...searchSalesWhere({
      ...filters,
      source: filters.source === "RECEIPT_SCAN" ? undefined : filters.source,
    }),
    ...inMonths,
  };

  const [expenseCount, salesCount] = await Promise.all([
    includeExpenses ? prisma.expenseRecord.count({ where: expenseWhere }) : 0,
    includeSales ? prisma.salesReferenceRecord.count({ where: salesWhere }) : 0,
  ]);
  const rowCount = expenseCount + salesCount;
  if (rowCount > MAX_EXPORT_ROWS) {
    throw new ApiError(
      400,
      `This export has ${rowCount.toLocaleString("en-US")} records, more than the ${MAX_EXPORT_ROWS.toLocaleString("en-US")} a spreadsheet can open. Export one month or a shorter date range instead.`,
    );
  }

  async function* expenses(): AsyncGenerator<Line> {
    if (!includeExpenses) return;
    let cursor: number | undefined;
    for (;;) {
      const page = await prisma.expenseRecord.findMany({
        where: expenseWhere,
        orderBy: [{ date: "asc" }, { id: "asc" }],
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true, date: true, description: true, vendor: true, amount: true, source: true, reviewStatus: true,
          category: { select: { name: true } },
        },
      });
      for (const r of page) {
        yield {
          date: r.date, kind: 0, id: r.id,
          csv: csvRowWithAmount(
            [utcDateKey(r.date), "Expense", r.description, r.vendor, r.category.name],
            r.amount.toFixed(2),
            [SOURCE_LABEL[r.source], r.reviewStatus],
          ),
        };
      }
      if (page.length < PAGE_SIZE) return;
      cursor = page.at(-1)!.id;
    }
  }

  async function* sales(): AsyncGenerator<Line> {
    if (!includeSales) return;
    let cursor: number | undefined;
    for (;;) {
      const page = await prisma.salesReferenceRecord.findMany({
        where: salesWhere,
        orderBy: [{ date: "asc" }, { id: "asc" }],
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, date: true, description: true, amount: true, source: true, reviewStatus: true },
      });
      for (const r of page) {
        yield {
          date: r.date, kind: 1, id: r.id,
          csv: csvRowWithAmount(
            [utcDateKey(r.date), "Sales", r.description, "", ""],
            r.amount.toFixed(2),
            [SOURCE_LABEL[r.source], r.reviewStatus],
          ),
        };
      }
      if (page.length < PAGE_SIZE) return;
      cursor = page.at(-1)!.id;
    }
  }

  return {
    chunks: async function* () {
      yield CSV_BOM + csvRow(EXPORT_HEADER);
      // Both tables come back oldest first; merge them as a ledger reads,
      // expenses before sales on the same day. Batched so each write is one
      // chunk of rows rather than one per line.
      const a = expenses();
      const b = sales();
      let x = await a.next();
      let y = await b.next();
      let batch = "";
      let n = 0;
      while (!x.done || !y.done) {
        const takeA = !x.done && (y.done || compareLines(x.value, y.value) <= 0);
        if (takeA) { batch += x.value.csv; x = await a.next(); }
        else { batch += (y as IteratorYieldResult<Line>).value.csv; y = await b.next(); }
        if (++n === PAGE_SIZE) { yield batch; batch = ""; n = 0; }
      }
      if (batch) yield batch;
    },
  };
}

function compareLines(a: Line, b: Line): number {
  return a.date.getTime() - b.date.getTime() || a.kind - b.kind || a.id - b.id;
}
