import { Prisma } from "@prisma/client";
import type { SalesReferenceRecord, SalesRecordSource } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../middleware/error.middleware";
import { requireOwnedBusinessProfile } from "../lib/ownership";
import { createNotification, NOTIFICATION_TYPES } from "./notification.service";

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
