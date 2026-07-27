import { parse } from "csv-parse/sync";
import { prisma } from "../config/prisma";
import { requireOwnedBusinessProfile } from "../lib/ownership";
import { uploadCsvFile } from "./storage.service";
import { createExpenseRecord } from "./expenseRecord.service";
import { createSalesRecord } from "./salesRecord.service";
import { createNotification, NOTIFICATION_TYPES } from "./notification.service";

export interface ColumnMapping {
  date: string;
  description: string;
  amount: string;
  category?: string;
}

export interface PreviewResult {
  headers: string[];
  previewRows: Record<string, string>[];
  totalRows: number;
}

export interface ConfirmInput {
  businessProfileId: number;
  recordType: "expense" | "sales";
  title: string;
  buffer: Buffer;
  originalname: string;
  columnMapping: ColumnMapping;
}

export interface SkippedRow {
  row: number;
  reason: string;
}

function parseCsv(buffer: Buffer): Record<string, string>[] {
  return parse(buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, string>[];
}

export function previewCsv(buffer: Buffer): PreviewResult {
  const records = parseCsv(buffer);
  const headers = records.length > 0 ? Object.keys(records[0]!) : [];
  return { headers, previewRows: records.slice(0, 20), totalRows: records.length };
}

export async function confirmImport(userId: number, input: ConfirmInput) {
  await requireOwnedBusinessProfile(userId, input.businessProfileId);

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

  const categoryCache = new Map<string, number>();
  if (input.recordType === "expense") {
    const existing = await prisma.expenseCategory.findMany({ where: { businessProfileId: input.businessProfileId } });
    for (const c of existing) categoryCache.set(c.name.toLowerCase(), c.id);
  }

  const skipped: SkippedRow[] = [];
  let imported = 0;
  // Duplicate flags and large-expense flags are counted separately: the two
  // mean different things to the owner, and the batch status has to account for
  // both. Counting only duplicates marked a batch "Completed" while its records
  // were sitting in the review queue.
  let flagged = 0;
  let largeExpenseFlagged = 0;

  for (let i = 0; i < records.length; i++) {
    const row = records[i]!;
    const rowNumber = i + 2; // header is row 1, data is 1-indexed after it

    const rawDate = row[input.columnMapping.date]?.trim();
    const rawDescription = row[input.columnMapping.description]?.trim();
    const rawAmount = row[input.columnMapping.amount]?.trim();

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

    if (input.recordType === "expense") {
      const rawCategory = input.columnMapping.category ? row[input.columnMapping.category]?.trim() : undefined;
      if (!rawCategory) {
        skipped.push({ row: rowNumber, reason: "Missing category" });
        continue;
      }

      let categoryId = categoryCache.get(rawCategory.toLowerCase());
      if (!categoryId) {
        const created = await prisma.expenseCategory.create({
          data: { businessProfileId: input.businessProfileId, name: rawCategory },
        });
        categoryId = created.id;
        categoryCache.set(rawCategory.toLowerCase(), categoryId);
      }

      const result = await createExpenseRecord(userId, {
        businessProfileId: input.businessProfileId,
        categoryId,
        date: isoDate,
        description: rawDescription,
        amount: amountNum,
        source: "CSV_UPLOAD",
        importBatchId: batch.id,
      });
      imported++;
      if (result.duplicateStatus === "Flagged") flagged++;
      if (result.largeExpenseFlag) largeExpenseFlagged++;
    } else {
      const result = await createSalesRecord(userId, {
        businessProfileId: input.businessProfileId,
        date: isoDate,
        description: rawDescription,
        amount: amountNum,
        source: "CSV_UPLOAD",
        importBatchId: batch.id,
      });
      imported++;
      if (result.duplicateStatus === "Flagged") flagged++;
    }
  }

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
