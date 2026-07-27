import { Prisma } from "@prisma/client";
import type { ExpenseRecord, ExpenseRecordSource } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../middleware/error.middleware";
import { requireOwnedBusinessProfile } from "../lib/ownership";
import { createNotification, NOTIFICATION_TYPES } from "./notification.service";

interface CreateInput {
  businessProfileId: number;
  categoryId: number;
  date: string;
  description: string;
  vendor?: string;
  amount: number;
  source?: ExpenseRecordSource;
  receiptScanId?: number;
  importBatchId?: number;
}

interface UpdateInput {
  categoryId?: number;
  date?: string;
  description?: string;
  vendor?: string | null;
  amount?: number;
  reviewStatus?: "Reviewed" | "Needs Review";
  duplicateStatus?: "Not a Duplicate" | "Flagged";
}

export interface SearchFilters {
  businessProfileId: number;
  categoryId?: number;
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  source?: ExpenseRecordSource;
}

function toDTO(record: ExpenseRecord) {
  return {
    id: record.id,
    type: "expense" as const,
    businessProfileId: record.businessProfileId,
    categoryId: record.categoryId,
    receiptScanId: record.receiptScanId,
    importBatchId: record.importBatchId,
    duplicateOfRecordId: record.duplicateOfRecordId,
    date: record.date,
    description: record.description,
    vendor: record.vendor,
    amount: Number(record.amount),
    source: record.source,
    reviewStatus: record.reviewStatus,
    duplicateStatus: record.duplicateStatus,
    largeExpenseFlag: record.largeExpenseFlag,
    createdAt: record.createdAt,
  };
}

async function findDuplicate(businessProfileId: number, date: Date, amount: Prisma.Decimal, description: string, excludeId?: number) {
  return prisma.expenseRecord.findFirst({
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

async function verifyCategoryBelongsToProfile(categoryId: number, businessProfileId: number) {
  const category = await prisma.expenseCategory.findFirst({ where: { id: categoryId, businessProfileId } });
  if (!category) {
    throw new ApiError(400, "Category does not belong to this business profile");
  }
}

export async function createExpenseRecord(userId: number, input: CreateInput) {
  const profile = await requireOwnedBusinessProfile(userId, input.businessProfileId);
  await verifyCategoryBelongsToProfile(input.categoryId, input.businessProfileId);

  const date = new Date(input.date);
  const amount = new Prisma.Decimal(input.amount);

  const duplicate = await findDuplicate(input.businessProfileId, date, amount, input.description);
  const threshold = Number(profile.expectedMonthlyExpenses) * (Number(profile.largeExpenseThresholdPercent) / 100);
  const largeExpenseFlag = input.amount >= threshold;

  const record = await prisma.expenseRecord.create({
    data: {
      businessProfileId: input.businessProfileId,
      categoryId: input.categoryId,
      date,
      description: input.description,
      vendor: input.vendor,
      amount,
      source: input.source ?? "MANUAL_ENTRY",
      receiptScanId: input.receiptScanId,
      importBatchId: input.importBatchId,
      largeExpenseFlag,
      reviewStatus: largeExpenseFlag ? "Needs Review" : "Reviewed",
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
  if (largeExpenseFlag) {
    await createNotification(
      userId,
      input.businessProfileId,
      NOTIFICATION_TYPES.LARGE_EXPENSE_FLAG,
      `Large expense flagged: "${input.description}" (PHP ${input.amount}) on ${input.date}`
    );
  }

  return toDTO(record);
}

export async function getExpenseRecord(userId: number, id: number) {
  const record = await prisma.expenseRecord.findFirst({
    where: { id, businessProfile: { userId } },
  });
  if (!record) {
    throw new ApiError(404, "Expense record not found");
  }
  return toDTO(record);
}

export async function updateExpenseRecord(userId: number, id: number, input: UpdateInput) {
  const existing = await prisma.expenseRecord.findFirst({
    where: { id, businessProfile: { userId } },
    include: { businessProfile: true },
  });
  if (!existing) {
    throw new ApiError(404, "Expense record not found");
  }

  if (input.categoryId) {
    await verifyCategoryBelongsToProfile(input.categoryId, existing.businessProfileId);
  }

  const nextDate = input.date ? new Date(input.date) : existing.date;
  const nextAmount = input.amount !== undefined ? new Prisma.Decimal(input.amount) : existing.amount;
  const nextDescription = input.description ?? existing.description;

  // Re-run duplicate detection and the large-expense check whenever a
  // value field that affects them changes — a stale flag from before the
  // edit would be misleading.
  const valueFieldsChanged = input.date !== undefined || input.amount !== undefined || input.description !== undefined;
  let duplicateStatus = input.duplicateStatus ?? existing.duplicateStatus;
  let duplicateOfRecordId = existing.duplicateOfRecordId;
  let largeExpenseFlag = existing.largeExpenseFlag;
  let reviewStatus = input.reviewStatus ?? existing.reviewStatus;

  if (valueFieldsChanged) {
    const duplicate = await findDuplicate(existing.businessProfileId, nextDate, nextAmount, nextDescription, existing.id);
    duplicateStatus = duplicate ? "Flagged" : "Not a Duplicate";
    duplicateOfRecordId = duplicate?.id ?? null;

    const threshold =
      Number(existing.businessProfile.expectedMonthlyExpenses) *
      (Number(existing.businessProfile.largeExpenseThresholdPercent) / 100);
    largeExpenseFlag = Number(nextAmount) >= threshold;
    if (input.reviewStatus === undefined) {
      reviewStatus = largeExpenseFlag ? "Needs Review" : "Reviewed";
    }
  }

  const record = await prisma.expenseRecord.update({
    where: { id },
    data: {
      categoryId: input.categoryId,
      date: nextDate,
      description: nextDescription,
      vendor: input.vendor,
      amount: nextAmount,
      largeExpenseFlag,
      reviewStatus,
      duplicateStatus,
      duplicateOfRecordId,
    },
  });

  // Only alert on a fresh transition into the flagged state — not on
  // every edit to a record that was already flagged (or stays clear).
  if (duplicateStatus === "Flagged" && existing.duplicateStatus !== "Flagged") {
    await createNotification(
      userId,
      existing.businessProfileId,
      NOTIFICATION_TYPES.POSSIBLE_DUPLICATE,
      `Possible duplicate: "${nextDescription}" (PHP ${Number(nextAmount)}) on ${nextDate.toISOString().slice(0, 10)}`
    );
  }
  if (largeExpenseFlag && !existing.largeExpenseFlag) {
    await createNotification(
      userId,
      existing.businessProfileId,
      NOTIFICATION_TYPES.LARGE_EXPENSE_FLAG,
      `Large expense flagged: "${nextDescription}" (PHP ${Number(nextAmount)}) on ${nextDate.toISOString().slice(0, 10)}`
    );
  }

  return toDTO(record);
}

export async function deleteExpenseRecord(userId: number, id: number) {
  const existing = await prisma.expenseRecord.findFirst({ where: { id, businessProfile: { userId } } });
  if (!existing) {
    throw new ApiError(404, "Expense record not found");
  }
  await prisma.expenseRecord.delete({ where: { id } });
}

export async function searchExpenseRecords(userId: number, filters: SearchFilters) {
  await requireOwnedBusinessProfile(userId, filters.businessProfileId);

  const records = await prisma.expenseRecord.findMany({
    where: {
      businessProfileId: filters.businessProfileId,
      categoryId: filters.categoryId,
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

export async function listFlaggedExpenseRecords(userId: number, businessProfileId: number) {
  await requireOwnedBusinessProfile(userId, businessProfileId);
  const records = await prisma.expenseRecord.findMany({
    where: {
      businessProfileId,
      OR: [{ reviewStatus: "Needs Review" }, { duplicateStatus: "Flagged" }],
    },
    orderBy: { date: "desc" },
  });
  return records.map(toDTO);
}
