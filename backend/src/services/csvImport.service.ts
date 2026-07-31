import { parse } from "csv-parse/sync";
import { prisma } from "../config/prisma";
import { requireOwnedBusinessProfile } from "../lib/ownership";
import { uploadCsvFile } from "./storage.service";
import { bulkCreateExpenseRecords } from "./expenseRecord.service";
import { bulkCreateSalesRecords } from "./salesRecord.service";
import { createNotification, NOTIFICATION_TYPES } from "./notification.service";

export interface ColumnMapping {
  date: string;
  description: string;
  amount: string;
  category?: string;
  /**
   * Optional, unlike the others. ExpenseRecord.vendor is nullable and the Add
   * Expense form marks it optional, so a spreadsheet without a supplier column
   * still imports cleanly — it just can't fill one in. A row is never skipped
   * for lacking a vendor.
   */
  vendor?: string;
}

export interface PreviewResult {
  headers: string[];
  previewRows: Record<string, string>[];
  totalRows: number;
}

/** Replacement cell values, keyed by spreadsheet row number as a string. */
export type RowCorrections = Record<
  string,
  { date?: string; description?: string; amount?: string; category?: string }
>;

export interface ConfirmInput {
  businessProfileId: number;
  recordType: "expense" | "sales";
  title: string;
  buffer: Buffer;
  originalname: string;
  columnMapping: ColumnMapping;
  corrections?: RowCorrections;
}

export interface SkippedRow {
  row: number;
  reason: string;
}

function parseCsv(buffer: Buffer): Record<string, string>[] {
  return parse(buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, string>[];
}

// The preview is a full-height table on the mapping screen now, not the
// seven-row window it was built for, so 20 rows left most of it empty on a
// laptop. 50 is still a trivial payload (a few tens of KB) and covers a full
// screen of scrolling on any display.
const PREVIEW_ROW_LIMIT = 50;

export function previewCsv(buffer: Buffer): PreviewResult {
  const records = parseCsv(buffer);
  const headers = records.length > 0 ? Object.keys(records[0]!) : [];
  return { headers, previewRows: records.slice(0, PREVIEW_ROW_LIMIT), totalRows: records.length };
}

/**
 * Splits the parsed file into rows that can be imported and rows that can't.
 *
 * Pure — no queries, no ordering dependency on the database. Pulling it out of
 * the old insert loop is what lets the inserts be batched at all, and it keeps
 * the skip reasons (and the order they are checked in) in one readable place.
 */
function validateRows(
  records: Record<string, string>[],
  mapping: ColumnMapping,
  recordType: "expense" | "sales",
  corrections: RowCorrections = {},
) {
  const valid: { date: string; description: string; amount: number; category?: string; vendor?: string }[] = [];
  const skipped: SkippedRow[] = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i]!;
    const rowNumber = i + 2; // header is row 1, data is 1-indexed after it
    const fix = corrections[String(rowNumber)];

    // A correction stands in for the cell the file held, and is then checked
    // by exactly the same rules below — there is no path here that accepts a
    // corrected value the original format would have rejected.
    const rawDate = (fix?.date ?? row[mapping.date])?.trim();
    const rawDescription = (fix?.description ?? row[mapping.description])?.trim();
    const rawAmount = (fix?.amount ?? row[mapping.amount])?.trim();

    if (!rawDescription) {
      skipped.push({ row: rowNumber, reason: "Missing description" });
      continue;
    }

    const parsedDate = rawDate ? new Date(rawDate) : null;
    if (!rawDate || !parsedDate || Number.isNaN(parsedDate.getTime())) {
      skipped.push({ row: rowNumber, reason: `Invalid date: "${rawDate ?? ""}"` });
      continue;
    }

    const amountNum = rawAmount ? Number(rawAmount.replace(/,/g, "")) : NaN;
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      skipped.push({ row: rowNumber, reason: `Invalid amount: "${rawAmount ?? ""}"` });
      continue;
    }

    const isoDate = parsedDate.toISOString().slice(0, 10);

    if (recordType === "expense") {
      const rawCategory = (fix?.category ?? (mapping.category ? row[mapping.category] : undefined))?.trim();
      if (!rawCategory) {
        skipped.push({ row: rowNumber, reason: "Missing category" });
        continue;
      }
      // Checked last and never fatal — an empty vendor cell is simply no vendor.
      const rawVendor = (mapping.vendor ? row[mapping.vendor] : undefined)?.trim();
      valid.push({
        date: isoDate,
        description: rawDescription,
        amount: amountNum,
        category: rawCategory,
        vendor: rawVendor || undefined,
      });
    } else {
      valid.push({ date: isoDate, description: rawDescription, amount: amountNum });
    }
  }

  return { valid, skipped };
}

/**
 * Resolves every category name the file mentions to an id, creating the ones
 * that don't exist yet — in two queries rather than one per unseen name.
 *
 * Names are deduplicated case-insensitively, which is what stops a file
 * containing both "Inventory" and "inventory" from silently creating two
 * categories that the owner then has to merge by hand.
 */
async function resolveCategories(businessProfileId: number, names: string[]) {
  const existing = await prisma.expenseCategory.findMany({ where: { businessProfileId } });
  const byName = new Map(existing.map((c) => [c.name.toLowerCase(), c.id]));

  const missing = new Map<string, string>();
  for (const name of names) {
    const key = name.toLowerCase();
    if (!byName.has(key) && !missing.has(key)) missing.set(key, name);
  }

  if (missing.size > 0) {
    const created = await prisma.expenseCategory.createManyAndReturn({
      data: [...missing.values()].map((name) => ({ businessProfileId, name })),
    });
    for (const c of created) byName.set(c.name.toLowerCase(), c.id);
  }

  return byName;
}

export async function confirmImport(userId: number, input: ConfirmInput) {
  const profile = await requireOwnedBusinessProfile(userId, input.businessProfileId);

  const records = parseCsv(input.buffer);
  const fileReference = await uploadCsvFile(input.businessProfileId, input.buffer, input.originalname);

  const batch = await prisma.cSVImportBatch.create({
    data: {
      businessProfileId: input.businessProfileId,
      title: input.title,
      uploadDate: new Date(),
      fileReference,
      status: "Needs Review",
    },
  });

  const { valid, skipped } = validateRows(records, input.columnMapping, input.recordType, input.corrections);

  // Duplicate flags and large-expense flags are counted separately: the two
  // mean different things to the owner, and the batch status has to account for
  // both. Counting only duplicates marked a batch "Completed" while its records
  // were sitting in the review queue.
  let flagged = 0;
  let largeExpenseFlagged = 0;

  if (input.recordType === "expense") {
    const categoryIds = await resolveCategories(
      input.businessProfileId,
      valid.map((r) => r.category!),
    );
    const created = await bulkCreateExpenseRecords(userId, profile, batch.id,
      valid.map((r) => ({
        categoryId: categoryIds.get(r.category!.toLowerCase())!,
        date: r.date,
        description: r.description,
        amount: r.amount,
        vendor: r.vendor,
      })),
    );
    flagged = created.filter((r) => r.duplicateStatus === "Flagged").length;
    largeExpenseFlagged = created.filter((r) => r.largeExpenseFlag).length;
  } else {
    const created = await bulkCreateSalesRecords(userId, input.businessProfileId, batch.id, valid);
    flagged = created.filter((r) => r.duplicateStatus === "Flagged").length;
  }

  const imported = valid.length;

  // A large-expense flag sets the record's reviewStatus to "Needs Review", so a
  // batch containing one genuinely needs review — reporting "Completed" told
  // the owner there was nothing to look at while records sat in the queue.
  const needsReview = skipped.length > 0 || flagged > 0 || largeExpenseFlagged > 0;
  const status = needsReview ? "Needs Review" : "Completed";
  const updatedBatch = await prisma.cSVImportBatch.update({ where: { id: batch.id }, data: { status } });

  if (needsReview) {
    const parts = [`${skipped.length} row(s) skipped`, `${flagged} flagged as possible duplicates`];
    if (largeExpenseFlagged > 0) {
      parts.push(`${largeExpenseFlagged} flagged as a large expense`);
    }
    await createNotification(
      userId,
      input.businessProfileId,
      NOTIFICATION_TYPES.NEEDS_REVIEW,
      `CSV import "${input.title}": ${parts.join(", ")}`
    );
  }

  return {
    batchId: updatedBatch.id,
    title: updatedBatch.title,
    status: updatedBatch.status,
    totalRows: records.length,
    imported,
    skipped,
    flagged,
    largeExpenseFlagged,
  };
}
