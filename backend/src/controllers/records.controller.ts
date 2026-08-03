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
  // Only meaningful alongside source=CSV_UPLOAD, but not rejected otherwise —
  // a stale query param left over from switching sources should be ignored,
  // not turned into a 400 for the owner.
  importBatchId: z.coerce.number().int().positive().optional(),
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
          importBatchId: query.importBatchId,
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
          importBatchId: query.importBatchId,
        })
      : Promise.resolve([]),
  ]);

  res.status(200).json(sortByDateDesc([...expenses, ...sales]));
}

/**
 * A ceiling on one request, not on how many duplicates a business may have.
 *
 * A re-imported spreadsheet is the case this exists for and they run to
 * hundreds of rows, so the limit has to clear a realistic import comfortably.
 * It is here to stop an unbounded `IN (...)` being built from request input at
 * all, which is a different concern from what any real owner would send.
 */
const MAX_BULK_IDS = 1000;

const resolveDuplicatesSchema = z.object({
  businessProfileId: z.coerce.number().int().positive(),
  action: z.enum(["keep", "discard"]),
  expenseIds: z.array(z.number().int().positive()).max(MAX_BULK_IDS).default([]),
  salesIds: z.array(z.number().int().positive()).max(MAX_BULK_IDS).default([]),
});

export async function resolveDuplicates(req: Request, res: Response) {
  const body = resolveDuplicatesSchema.parse(req.body);
  const userId = req.user!.id;

  /*
   * Sequential, not Promise.all. Both halves can delete records that share an
   * import batch, and cleanUpImportBatchIfOrphaned decides whether to remove
   * that batch by counting what is left across BOTH tables — running the two
   * concurrently lets each count rows the other is in the middle of deleting,
   * and the batch survives with nothing pointing at it.
   */
  const expenses = await expenseRecordService.bulkResolveExpenseDuplicates(
    userId,
    body.businessProfileId,
    body.expenseIds,
    body.action,
  );
  const sales = await salesRecordService.bulkResolveSalesDuplicates(
    userId,
    body.businessProfileId,
    body.salesIds,
    body.action,
  );

  res.status(200).json({ action: body.action, resolved: expenses + sales, expenses, sales });
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
