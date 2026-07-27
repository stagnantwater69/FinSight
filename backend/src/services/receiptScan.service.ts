import { prisma } from "../config/prisma";
import { ApiError } from "../middleware/error.middleware";
import { requireOwnedBusinessProfile } from "../lib/ownership";
import { uploadReceiptImage } from "./storage.service";
import { extractText, parseReceiptFields } from "./ocr.service";
import { createExpenseRecord } from "./expenseRecord.service";
import type { ReceiptScan } from "@prisma/client";

interface UploadInput {
  businessProfileId: number;
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

interface ConfirmInput {
  categoryId: number;
  date: string;
  description: string;
  vendor?: string;
  amount: number;
}

function toDTO(scan: ReceiptScan) {
  return {
    id: scan.id,
    businessProfileId: scan.businessProfileId,
    imageFile: scan.imageFile,
    extractedDate: scan.extractedDate,
    extractedVendor: scan.extractedVendor,
    extractedDescription: scan.extractedDescription,
    extractedAmount: scan.extractedAmount ? Number(scan.extractedAmount) : null,
    confirmationStatus: scan.confirmationStatus,
    createdAt: scan.createdAt,
  };
}

export async function uploadAndScan(userId: number, input: UploadInput) {
  await requireOwnedBusinessProfile(userId, input.businessProfileId);

  const imagePath = await uploadReceiptImage(
    input.businessProfileId,
    input.buffer,
    input.mimetype,
    input.originalname
  );

  const text = await extractText(input.buffer);
  const parsed = parseReceiptFields(text);

  const scan = await prisma.receiptScan.create({
    data: {
      businessProfileId: input.businessProfileId,
      imageFile: imagePath,
      extractedDate: parsed.date ? new Date(parsed.date) : undefined,
      extractedVendor: parsed.vendor ?? undefined,
      extractedDescription: parsed.description ?? undefined,
      extractedAmount: parsed.amount ?? undefined,
      confirmationStatus: "Pending",
    },
  });

  return toDTO(scan);
}

export async function confirmReceipt(userId: number, receiptScanId: number, input: ConfirmInput) {
  const scan = await prisma.receiptScan.findFirst({
    where: { id: receiptScanId, businessProfile: { userId } },
  });
  if (!scan) {
    throw new ApiError(404, "Receipt scan not found");
  }
  if (scan.confirmationStatus === "Confirmed") {
    throw new ApiError(400, "This receipt scan has already been confirmed");
  }
  if (!scan.businessProfileId) {
    throw new ApiError(400, "Receipt scan is not linked to a business profile");
  }

  const record = await createExpenseRecord(userId, {
    businessProfileId: scan.businessProfileId,
    categoryId: input.categoryId,
    date: input.date,
    description: input.description,
    vendor: input.vendor,
    amount: input.amount,
    source: "RECEIPT_SCAN",
    receiptScanId: scan.id,
  });

  await prisma.receiptScan.update({
    where: { id: scan.id },
    data: { confirmationStatus: "Confirmed" },
  });

  return record;
}
