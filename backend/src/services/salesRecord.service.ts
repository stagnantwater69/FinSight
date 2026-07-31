import { Prisma } from "@prisma/client";
import type { SalesReferenceRecord, SalesRecordSource } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../middleware/error.middleware";
import { requireOwnedBusinessProfile } from "../lib/ownership";
import { createNotification, NOTIFICATION_TYPES } from "./notification.service";
import { duplicateKeyOf } from "./expenseRecord.service";

interface CreateInput {
  businessProfileId: number;
  date: string;
  description: string;
  amount: number;
  source?: SalesRecordSource;
  importBatchId?: number;
}

interface UpdateInput {
  date?: string;
  description?: string;
  amount?: number;
  reviewStatus?: "Reviewed" | "Needs Review";
  duplicateStatus?: "Not a Duplicate" | "Flagged";
}

export interface SearchFilters {
  businessProfileId: number;
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  source?: SalesRecordSource;
}

function toDTO(record: SalesReferenceRecord) {
  return {
    id: record.id,
    type: "sales" as const,
    businessProfileId: record.businessProfileId,
    importBatchId: record.importBatchId,
    duplicateOfRecordId: record.duplicateOfRecordId,
    date: record.date,
    description: record.description,
    amount: Number(record.amount),
    source: record.source,
    reviewStatus: record.reviewStatus,
    duplicateStatus: record.duplicateStatus,
    createdAt: record.createdAt,
  };
}

async function findDuplicate(businessProfileId: number, date: Date, amount: Prisma.Decimal, description: string, excludeId?: number) {
  return prisma.salesReferenceRecord.findFirst({
    where: {
      businessProfileId,
      date,
      amount,
      description: { equals: description, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function createSalesRecord(userId: number, input: CreateInput) {
  await requireOwnedBusinessProfile(userId, input.businessProfileId);

  const date = new Date(input.date);
  const amount = new Prisma.Decimal(input.amount);

  const duplicate = await findDuplicate(input.businessProfileId, date, amount, input.description);

  const record = await prisma.salesReferenceRecord.create({
    data: {
      businessProfileId: input.businessProfileId,
      date,
      description: input.description,
      amount,
      source: input.source ?? "MANUAL_ENTRY",
      importBatchId: input.importBatchId,
      reviewStatus: "Reviewed",
      duplicateStatus: duplicate ? "Flagged" : "Not a Duplicate",
      duplicateOfRecordId: duplicate?.id,
    },
  });

  if (duplicate) {
    await createNotification(
      userId,
      input.businessProfileId,
      NOTIFICATION_TYPES.POSSIBLE_DUPLICATE,
      `Possible duplicate: "${input.description}" (PHP ${input.amount}) on ${input.date}`
    );
  }

  return toDTO(record);
}

export interface BulkSalesRow {
  /** YYYY-MM-DD. */
  date: string;
  description: string;
  amount: number;
}

/**
 * The sales-record half of the CSV bulk path — see bulkCreateExpenseRecords
 * for why this exists and what it replaces. Simpler than the expense side:
 * sales references have no category to verify and no large-expense rule, so
 * duplicate detection is the only per-row decision.
 */
export async function bulkCreateSalesRecords(
  userId: number,
  businessProfileId: number,
  importBatchId: number,
  rows: BulkSalesRow[],
) {
  if (rows.length === 0) return [];

  const dates = [...new Set(rows.map((r) => r.date))].map((d) => new Date(d));
  const candidates = await prisma.salesReferenceRecord.findMany({
    where: { businessProfileId, date: { in: dates } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, date: true, amount: true, description: true },
  });

  const existingIdByKey = new Map<string, number>();
  for (const c of candidates) {
    const key = duplicateKeyOf(c.date, c.amount, c.description);
    if (!existingIdByKey.has(key)) existingIdByKey.set(key, c.id);
  }

  const firstIndexByKey = new Map<string, number>();
  const duplicatesEarlierRow = new Map<number, number>();

  const data = rows.map((row, i) => {
    const date = new Date(row.date);
    const amount = new Prisma.Decimal(row.amount);
    const key = duplicateKeyOf(date, amount, row.description);

    const existingId = existingIdByKey.get(key);
    const earlierIndex = firstIndexByKey.get(key);
    if (existingId === undefined && earlierIndex === undefined) {
      firstIndexByKey.set(key, i);
    } else if (existingId === undefined) {
      duplicatesEarlierRow.set(i, earlierIndex!);
    }

    return {
      businessProfileId,
      date,
      description: row.description,
      amount,
      source: "CSV_UPLOAD" as const,
      importBatchId,
      reviewStatus: "Reviewed",
      duplicateStatus: existingId !== undefined || earlierIndex !== undefined ? "Flagged" : "Not a Duplicate",
      duplicateOfRecordId: existingId,
    };
  });

  const created = await prisma.salesReferenceRecord.createManyAndReturn({ data });
  if (created.length !== rows.length) {
    throw new ApiError(500, "Import did not create the expected number of records");
  }

  if (duplicatesEarlierRow.size > 0) {
    await prisma.$transaction(
      [...duplicatesEarlierRow].map(([rowIndex, earlierIndex]) =>
        prisma.salesReferenceRecord.update({
          where: { id: created[rowIndex]!.id },
          data: { duplicateOfRecordId: created[earlierIndex]!.id },
        }),
      ),
    );
  }

  // Sales duplicates carry no expenseRecordId — the column only ever points at
  // an expense record, exactly as the single-record path leaves it unset.
  const notifications = data.flatMap((d, i) =>
    d.duplicateStatus === "Flagged"
      ? [
          {
            userId,
            businessProfileId,
            type: NOTIFICATION_TYPES.POSSIBLE_DUPLICATE,
            message: `Possible duplicate: "${rows[i]!.description}" (PHP ${rows[i]!.amount}) on ${rows[i]!.date}`.slice(0, 255),
          },
        ]
      : [],
  );
  if (notifications.length > 0) {
    await prisma.notification.createMany({ data: notifications });
  }

  return created.map(toDTO);
}

export async function getSalesRecord(userId: number, id: number) {
  const record = await prisma.salesReferenceRecord.findFirst({
    where: { id, businessProfile: { userId } },
  });
  if (!record) {
    throw new ApiError(404, "Sales reference record not found");
  }
  return toDTO(record);
}

export async function updateSalesRecord(userId: number, id: number, input: UpdateInput) {
  const existing = await prisma.salesReferenceRecord.findFirst({
    where: { id, businessProfile: { userId } },
  });
  if (!existing) {
    throw new ApiError(404, "Sales reference record not found");
  }

  const nextDate = input.date ? new Date(input.date) : existing.date;
  const nextAmount = input.amount !== undefined ? new Prisma.Decimal(input.amount) : existing.amount;
  const nextDescription = input.description ?? existing.description;

  const valueFieldsChanged = input.date !== undefined || input.amount !== undefined || input.description !== undefined;
  let duplicateStatus = input.duplicateStatus ?? existing.duplicateStatus;
  let duplicateOfRecordId = existing.duplicateOfRecordId;

  if (valueFieldsChanged) {
    const duplicate = await findDuplicate(existing.businessProfileId, nextDate, nextAmount, nextDescription, existing.id);
    duplicateStatus = duplicate ? "Flagged" : "Not a Duplicate";
    duplicateOfRecordId = duplicate?.id ?? null;
  }

  const record = await prisma.salesReferenceRecord.update({
    where: { id },
    data: {
      date: nextDate,
      description: nextDescription,
      amount: nextAmount,
      reviewStatus: input.reviewStatus ?? existing.reviewStatus,
      duplicateStatus,
      duplicateOfRecordId,
    },
  });

  if (duplicateStatus === "Flagged" && existing.duplicateStatus !== "Flagged") {
    await createNotification(
      userId,
      existing.businessProfileId,
      NOTIFICATION_TYPES.POSSIBLE_DUPLICATE,
      `Possible duplicate: "${nextDescription}" (PHP ${Number(nextAmount)}) on ${nextDate.toISOString().slice(0, 10)}`
    );
  }

  return toDTO(record);
}

export async function deleteSalesRecord(userId: number, id: number) {
  const existing = await prisma.salesReferenceRecord.findFirst({ where: { id, businessProfile: { userId } } });
  if (!existing) {
    throw new ApiError(404, "Sales reference record not found");
  }
  await prisma.salesReferenceRecord.delete({ where: { id } });
}

export async function searchSalesRecords(userId: number, filters: SearchFilters) {
  await requireOwnedBusinessProfile(userId, filters.businessProfileId);

  const records = await prisma.salesReferenceRecord.findMany({
    where: {
      businessProfileId: filters.businessProfileId,
      source: filters.source,
      date: {
        gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
      },
      description: filters.keyword ? { contains: filters.keyword, mode: "insensitive" } : undefined,
    },
    orderBy: { date: "desc" },
  });

  return records.map(toDTO);
}

export async function listFlaggedSalesRecords(userId: number, businessProfileId: number) {
  await requireOwnedBusinessProfile(userId, businessProfileId);
  const records = await prisma.salesReferenceRecord.findMany({
    where: {
      businessProfileId,
      OR: [{ reviewStatus: "Needs Review" }, { duplicateStatus: "Flagged" }],
    },
    orderBy: { date: "desc" },
  });
  return records.map(toDTO);
}
