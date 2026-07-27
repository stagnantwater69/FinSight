import type { Request, Response } from "express";
import { z } from "zod";
import * as expenseRecordService from "../services/expenseRecord.service";
import * as salesRecordService from "../services/salesRecord.service";

const searchQuerySchema = z.object({
  businessProfileId: z.coerce.number().int().positive(),
  type: z.enum(["expense", "sales", "all"]).default("all"),
  categoryId: z.coerce.number().int().positive().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  keyword: z.string().max(255).optional(),
  // Enum keys, not the Title Case display labels — the display labels are
  // what the DB columns store (@map), but the API speaks Prisma enum keys
  // like every other enum field in this app.
  source: z.enum(["MANUAL_ENTRY", "CSV_UPLOAD", "RECEIPT_SCAN"]).optional(),
});

const flaggedQuerySchema = z.object({
  businessProfileId: z.coerce.number().int().positive(),
});

function sortByDateDesc<T extends { date: Date }>(records: T[]): T[] {
  return [...records].sort((a, b) => b.date.getTime() - a.date.getTime());
}

export async function search(req: Request, res: Response) {
  const query = searchQuerySchema.parse(req.query);
  const userId = req.user!.id;

  const [expenses, sales] = await Promise.all([
    query.type !== "sales"
      ? expenseRecordService.searchExpenseRecords(userId, {
          businessProfileId: query.businessProfileId,
          categoryId: query.categoryId,
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
          keyword: query.keyword,
          source: query.source,
        })
      : Promise.resolve([]),
    // Sales reference records have no RECEIPT_SCAN source (receipts are
    // expenses only), so that filter necessarily excludes all sales rather
    // than being passed to a query that would reject the enum value.
    query.type !== "expense" && query.source !== "RECEIPT_SCAN"
      ? salesRecordService.searchSalesRecords(userId, {
          businessProfileId: query.businessProfileId,
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
          keyword: query.keyword,
          source: query.source,
        })
      : Promise.resolve([]),
  ]);

  res.status(200).json(sortByDateDesc([...expenses, ...sales]));
}

export async function flagged(req: Request, res: Response) {
  const query = flaggedQuerySchema.parse(req.query);
  const userId = req.user!.id;

  const [expenses, sales] = await Promise.all([
    expenseRecordService.listFlaggedExpenseRecords(userId, query.businessProfileId),
    salesRecordService.listFlaggedSalesRecords(userId, query.businessProfileId),
  ]);

  res.status(200).json(sortByDateDesc([...expenses, ...sales]));
}
