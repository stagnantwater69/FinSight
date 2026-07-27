import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Storage is external; OCR is mocked here so this test covers the FLOW
// (upload -> extract -> pending -> confirm -> expense record) deterministically.
// Real OCR accuracy is measured separately by the OCR accuracy assessment
// against a sample of real and degraded images — that is a different question
// from whether the flow wires up correctly.
vi.mock("../../src/services/storage.service", () => ({
  uploadReceiptImage: vi.fn(async () => "1/mock-receipt.jpg"),
  uploadCsvFile: vi.fn(async () => "1/mock.csv"),
}));

// vi.mock is hoisted above ordinary declarations, so the spy has to be created
// inside vi.hoisted to exist by the time the factory runs. parseReceiptFields is
// kept real — this test asserts on its actual parsing of the OCR text.
const { extractTextMock } = vi.hoisted(() => ({ extractTextMock: vi.fn() }));
vi.mock("../../src/services/ocr.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/ocr.service")>();
  return { ...actual, extractText: extractTextMock };
});

import { prisma } from "../../src/config/prisma";
import { confirmReceipt, uploadAndScan } from "../../src/services/receiptScan.service";
import { disconnectDb, makeOwnerWithProfile, resetDb, utcDayString } from "../setup/testDb";

let ctx: Awaited<ReturnType<typeof makeOwnerWithProfile>>;

const RECEIPT_TEXT = [
  "ABC SARI-SARI STORE",
  "123 Apas Road, Cebu City",
  "Date: 2026-07-20",
  "Rice 25kg          1220.00",
  "Cooking oil          180.00",
  "TOTAL             1400.00",
  "Thank you!",
].join("\n");

beforeEach(async () => {
  await resetDb();
  ctx = await makeOwnerWithProfile({ expectedMonthlyExpenses: 60000, largeExpenseThresholdPercent: 25 });
  extractTextMock.mockReset();
  extractTextMock.mockResolvedValue(RECEIPT_TEXT);
});

afterAll(disconnectDb);

async function upload() {
  return uploadAndScan(ctx.user.id, {
    businessProfileId: ctx.profile.id,
    buffer: Buffer.from("fake-image-bytes"),
    mimetype: "image/jpeg",
    originalname: "receipt.jpg",
  });
}

describe("upload and scan", () => {
  it("creates a Pending scan with the extracted fields", async () => {
    const scan = await upload();
    expect(scan.confirmationStatus).toBe("Pending");
    expect(scan.imageFile).toBe("1/mock-receipt.jpg");
    expect(scan.extractedAmount).toBe(1400);
    expect(scan.extractedVendor).toBe("ABC SARI-SARI STORE");
    expect(scan.extractedDate?.toISOString().slice(0, 10)).toBe("2026-07-20");
  });

  it("does not create an expense record until the owner confirms", async () => {
    await upload();
    expect(await prisma.expenseRecord.count({ where: { businessProfileId: ctx.profile.id } })).toBe(0);
  });

  it("stores the scan even when OCR extracts nothing usable", async () => {
    // A blurry photo must still produce a reviewable scan the owner can correct
    // by hand, not an error that loses their upload.
    extractTextMock.mockResolvedValue("~~~ unreadable ~~~");
    const scan = await upload();
    expect(scan.confirmationStatus).toBe("Pending");
    expect(scan.extractedAmount).toBeNull();
  });

  it("links the scan to the business profile", async () => {
    const scan = await upload();
    expect(scan.businessProfileId).toBe(ctx.profile.id);
  });

  it("refuses to scan into another owner's profile, with 404 not 403", async () => {
    const other = await makeOwnerWithProfile();
    await expect(
      uploadAndScan(ctx.user.id, {
        businessProfileId: other.profile.id,
        buffer: Buffer.from("x"),
        mimetype: "image/jpeg",
        originalname: "receipt.jpg",
      })
    ).rejects.toMatchObject({ status: 404 });
    expect(await prisma.receiptScan.count({ where: { businessProfileId: other.profile.id } })).toBe(0);
  });
});

describe("confirm", () => {
  it("creates an expense record tagged RECEIPT_SCAN and linked to the scan", async () => {
    const scan = await upload();
    const record = await confirmReceipt(ctx.user.id, scan.id, {
      categoryId: ctx.categories.Inventory!,
      date: utcDayString(-1),
      description: "Rice and cooking oil",
      vendor: "ABC Sari-Sari Store",
      amount: 1400,
    });

    expect(record.source).toBe("RECEIPT_SCAN");
    expect(record.receiptScanId).toBe(scan.id);
    expect(record.amount).toBe(1400);
    expect(record.description).toBe("Rice and cooking oil");
  });

  it("marks the scan Confirmed", async () => {
    const scan = await upload();
    await confirmReceipt(ctx.user.id, scan.id, {
      categoryId: ctx.categories.Inventory!,
      date: utcDayString(-1),
      description: "Rice",
      amount: 1400,
    });
    const stored = await prisma.receiptScan.findUniqueOrThrow({ where: { id: scan.id } });
    expect(stored.confirmationStatus).toBe("Confirmed");
  });

  it("lets the owner correct the OCR values before saving", async () => {
    // The extracted amount was 1400; the owner overrides it to 1220. The saved
    // record must reflect what the owner confirmed, not what OCR guessed.
    const scan = await upload();
    const record = await confirmReceipt(ctx.user.id, scan.id, {
      categoryId: ctx.categories.Inventory!,
      date: utcDayString(-2),
      description: "Rice only",
      amount: 1220,
    });
    expect(record.amount).toBe(1220);
    expect(scan.extractedAmount).toBe(1400);
  });

  it("refuses a second confirmation of the same scan", async () => {
    const scan = await upload();
    const input = {
      categoryId: ctx.categories.Inventory!,
      date: utcDayString(-1),
      description: "Rice",
      amount: 1400,
    };
    await confirmReceipt(ctx.user.id, scan.id, input);
    await expect(confirmReceipt(ctx.user.id, scan.id, input)).rejects.toMatchObject({ status: 400 });

    // Exactly one record, so a double submit can't duplicate the expense.
    expect(await prisma.expenseRecord.count({ where: { businessProfileId: ctx.profile.id } })).toBe(1);
  });

  it("applies the large-expense rule to a confirmed receipt", async () => {
    const scan = await upload();
    const record = await confirmReceipt(ctx.user.id, scan.id, {
      categoryId: ctx.categories.Inventory!,
      date: utcDayString(-1),
      description: "Bulk delivery from receipt",
      amount: 20000, // over 25% of 60,000
    });
    expect(record.largeExpenseFlag).toBe(true);
    expect(record.reviewStatus).toBe("Needs Review");
  });

  it("applies duplicate detection to a confirmed receipt", async () => {
    const day = utcDayString(-1);
    const first = await upload();
    await confirmReceipt(ctx.user.id, first.id, {
      categoryId: ctx.categories.Inventory!,
      date: day,
      description: "Rice",
      amount: 1400,
    });

    const second = await upload();
    const dup = await confirmReceipt(ctx.user.id, second.id, {
      categoryId: ctx.categories.Inventory!,
      date: day,
      description: "Rice",
      amount: 1400,
    });
    expect(dup.duplicateStatus).toBe("Flagged");
  });

  it("returns 404 for a scan belonging to another owner", async () => {
    const scan = await upload();
    const other = await makeOwnerWithProfile();
    await expect(
      confirmReceipt(other.user.id, scan.id, {
        categoryId: other.categories.Inventory!,
        date: utcDayString(-1),
        description: "Hijack attempt",
        amount: 100,
      })
    ).rejects.toMatchObject({ status: 404 });

    // The victim's scan is untouched and no record was created anywhere.
    const stored = await prisma.receiptScan.findUniqueOrThrow({ where: { id: scan.id } });
    expect(stored.confirmationStatus).toBe("Pending");
    expect(await prisma.expenseRecord.count()).toBe(0);
  });

  it("returns 404 for a scan that does not exist", async () => {
    await expect(
      confirmReceipt(ctx.user.id, 999999, {
        categoryId: ctx.categories.Inventory!,
        date: utcDayString(-1),
        description: "Nope",
        amount: 100,
      })
    ).rejects.toMatchObject({ status: 404 });
  });
});
