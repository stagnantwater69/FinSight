import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Storage is mocked the same way receiptScan.test.ts mocks it, except the
 * upload mock returns a DIFFERENT path per call — the real function already
 * does this (a random UUID per upload), and a test asserting page ORDER needs
 * distinguishable paths to assert against.
 */
const { uploadCallCount } = vi.hoisted(() => ({ uploadCallCount: { value: 0 } }));
vi.mock("../../src/services/storage.service", () => ({
  uploadReceiptImage: vi.fn(async () => `1/mock-page-${++uploadCallCount.value}.jpg`),
  uploadCsvFile: vi.fn(async () => "1/mock.csv"),
  signedReceiptImageUrl: vi.fn(async () => "https://example.test/signed.jpg"),
}));

/*
 * extractReceipt is driven by a QUEUE of {text, confidence} results consumed
 * one per call — one call happens per page, in page order — so a test can
 * give page 1 and page 2 different text and different confidence, which is
 * exactly what the concatenation and worst-page-confidence behaviour this
 * file tests need to control independently.
 */
const { pageQueue } = vi.hoisted(() => ({
  pageQueue: [] as { text: string; confidence: number }[],
}));
vi.mock("../../src/services/ocr.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/ocr.service")>();
  return {
    ...actual,
    extractReceipt: async () => {
      const next = pageQueue.shift() ?? { text: "", confidence: 95 };
      return { text: next.text, confidence: next.confidence, lines: [] };
    },
  };
});

const { categoriseMock } = vi.hoisted(() => ({ categoriseMock: vi.fn() }));
vi.mock("../../src/services/ai.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/ai.service")>();
  return { ...actual, categoriseReceiptItems: categoriseMock };
});

const { visionMock } = vi.hoisted(() => ({ visionMock: vi.fn() }));
vi.mock("../../src/services/visionOcr.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/visionOcr.service")>();
  return { ...actual, extractReceiptWithVision: visionMock };
});

import { prisma } from "../../src/config/prisma";
import { uploadAndScan, MAX_PAGES } from "../../src/services/receiptScan.service";
import { disconnectDb, makeOwnerWithProfile, resetDb, utcDayString } from "../setup/testDb";

let ctx: Awaited<ReturnType<typeof makeOwnerWithProfile>>;

beforeEach(async () => {
  await resetDb();
  ctx = await makeOwnerWithProfile({ expectedMonthlyExpenses: 60000, largeExpenseThresholdPercent: 25 }, [
    "Inventory",
  ]);
  uploadCallCount.value = 0;
  pageQueue.length = 0;
  categoriseMock.mockReset();
  categoriseMock.mockResolvedValue([]);
  visionMock.mockReset();
  visionMock.mockResolvedValue(null);
});

afterAll(disconnectDb);

function page(text: string, confidence = 95) {
  return { buffer: Buffer.from(`fake-bytes-${text.length}`), mimetype: "image/jpeg", originalname: "page.jpg" };
}

async function uploadPages(texts: { text: string; confidence?: number }[]) {
  for (const t of texts) pageQueue.push({ text: t.text, confidence: t.confidence ?? 95 });
  return uploadAndScan(ctx.user.id, {
    businessProfileId: ctx.profile.id,
    pages: texts.map((t) => page(t.text)),
  });
}

describe("multi-page receipt upload", () => {
  it("reconciles items spanning one page against a total printed on another", async () => {
    // The exact shape a long receipt takes: items on page 1, the total only
    // appears once everything has been rung up, on page 2.
    const scan = await uploadPages([
      { text: ["ABC STORE", "Date: 2026-07-20", "Rice 25kg    1220.00", "Cooking oil   180.00"].join("\n") },
      { text: ["TOTAL   1400.00"].join("\n") },
    ]);

    expect(scan.extractedAmount).toBe(1400);
    // Both items were read even though neither page contains BOTH of them
    // plus the total — proof the parser saw one concatenated document, not
    // two independent ones.
    const items = await prisma.receiptScanItem.findMany({ where: { receiptScanId: scan.id } });
    expect(items.map((i) => i.name).sort()).toEqual(["Cooking oil", "Rice 25kg"]);
  });

  it("stores one ReceiptScanPage row per page, in order, with the cover as page 1", async () => {
    const scan = await uploadPages([
      { text: "Date: 2026-07-20\nItem A   10.00" },
      { text: "Item B   20.00" },
      { text: "TOTAL   30.00" },
    ]);

    const pages = await prisma.receiptScanPage.findMany({
      where: { receiptScanId: scan.id },
      orderBy: { pageNumber: "asc" },
    });
    expect(pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
    expect(pages.map((p) => p.imageFile)).toEqual(["1/mock-page-1.jpg", "1/mock-page-2.jpg", "1/mock-page-3.jpg"]);
    expect(scan.imageFile).toBe(pages[0]!.imageFile);
  });

  it("rejects more than MAX_PAGES photographs", async () => {
    const texts = Array.from({ length: MAX_PAGES + 1 }, (_, i) => ({ text: `Item ${i}   1.00` }));
    await expect(uploadPages(texts)).rejects.toMatchObject({ status: 400 });
  });

  it("accepts exactly MAX_PAGES photographs", async () => {
    const texts = Array.from({ length: MAX_PAGES }, (_, i) => ({ text: `Item ${i}   1.00` }));
    await expect(uploadPages(texts)).resolves.toMatchObject({ confirmationStatus: "Pending" });
  });

  it("rejects an upload with no pages", async () => {
    await expect(
      uploadAndScan(ctx.user.id, { businessProfileId: ctx.profile.id, pages: [] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  /**
   * The design decision rescueWithVision's own comment states: the WORST
   * page decides whether the model gets asked, not an average. Chosen so the
   * two readings actually disagree — average(95, 60) is 77.5, ABOVE
   * LOW_CONFIDENCE (75), so an average-based trigger would stay silent here;
   * min(95, 60) is 60, below it. If this test passes under both an average
   * and a minimum implementation, it is not testing the claim at all.
   */
  it("triggers the vision rescue on the worst page even when the average would look fine", async () => {
    await uploadPages([
      { text: "Date: 2026-07-20\nItem A   10.00\nTOTAL 30.00", confidence: 95 },
      { text: "Item B   20.00", confidence: 60 }, // reconciles, so only confidence can trigger this
    ]);

    expect(visionMock).toHaveBeenCalledTimes(1);
  });

  it("does not trigger the vision rescue when every page reads well and reconciles", async () => {
    await uploadPages([
      { text: "Date: 2026-07-20\nItem A   10.00", confidence: 92 },
      { text: "Item B   20.00\nTOTAL 30.00", confidence: 90 },
    ]);

    expect(visionMock).not.toHaveBeenCalled();
  });

  it("sends every page to the vision model in a single call, not one call per page", async () => {
    // does-not-add-up trigger: forces the rescue so the call shape can be
    // inspected.
    await uploadPages([
      { text: "Date: 2026-07-20\nItem A   10.00" },
      { text: "Item B   20.00\nTOTAL 999.00" },
    ]);

    expect(visionMock).toHaveBeenCalledTimes(1);
    const [pagesArg] = visionMock.mock.calls[0]!;
    expect(pagesArg).toHaveLength(2);
  });

  it("flags adjacent pages that look like the same page shot twice", async () => {
    const scan = await uploadPages([
      { text: "ABC STORE\nDate: 2026-07-20\nItem A   10.00\nTOTAL 10.00" },
      // A near-identical re-photograph of the SAME page (one OCR noise line).
      { text: "ABC STORE\nDate: 2026-07-2O\nItem A   10.00\nTOTAL 10.00" },
    ]);

    expect(scan.duplicatePages).toEqual([2]);
  });

  it("does not flag genuinely different pages of one receipt", async () => {
    const scan = await uploadPages([
      { text: "ABC STORE\nDate: 2026-07-20\nItem A   10.00" },
      { text: "Item B   20.00\nTOTAL 30.00" },
    ]);

    expect(scan.duplicatePages).toEqual([]);
  });

  it("returns one quality reading per page", async () => {
    const scan = await uploadPages([{ text: "Item A 1.00" }, { text: "Item B 2.00" }, { text: "TOTAL 3.00" }]);
    expect(scan.pageQualities).toHaveLength(3);
  });
});
