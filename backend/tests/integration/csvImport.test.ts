import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Supabase Storage is the one external dependency in this flow. Mocked so the
// test exercises real parsing, real category resolution and real DB writes
// without needing network or credentials. The upload itself is covered by the
// live regression pass, not here.
vi.mock("../../src/services/storage.service", () => ({
  uploadCsvFile: vi.fn(async () => "test/mock-csv-path.csv"),
  uploadReceiptImage: vi.fn(async () => "test/mock-receipt-path.jpg"),
}));

import { prisma } from "../../src/config/prisma";
import { confirmImport, previewCsv } from "../../src/services/csvImport.service";
import { disconnectDb, makeOwnerWithProfile, resetDb, utcDayString } from "../setup/testDb";

let ctx: Awaited<ReturnType<typeof makeOwnerWithProfile>>;

beforeEach(async () => {
  await resetDb();
  ctx = await makeOwnerWithProfile(
    { expectedMonthlyExpenses: 60000, largeExpenseThresholdPercent: 25 },
    ["Inventory", "Utilities"]
  );
});

afterAll(disconnectDb);

const EXPENSE_MAPPING = {
  date: "Transaction Date",
  description: "Particulars",
  amount: "Cash Out",
  category: "Class",
};

function csv(rows: string[]): Buffer {
  return Buffer.from(["Transaction Date,Particulars,Cash Out,Class", ...rows].join("\n") + "\n");
}

async function importExpenses(
  buffer: Buffer,
  title = "Test batch",
  corrections?: Parameters<typeof confirmImport>[1]["corrections"],
) {
  return confirmImport(ctx.user.id, {
    businessProfileId: ctx.profile.id,
    recordType: "expense",
    title,
    buffer,
    originalname: "test.csv",
    columnMapping: EXPENSE_MAPPING,
    corrections,
  });
}

describe("previewCsv", () => {
  it("returns headers and row count without touching the database", () => {
    const result = previewCsv(csv([`${utcDayString(-1)},Item one,1400,Inventory`, `${utcDayString(-2)},Item two,900,Utilities`]));
    expect(result.headers).toEqual(["Transaction Date", "Particulars", "Cash Out", "Class"]);
    expect(result.totalRows).toBe(2);
    expect(result.previewRows).toHaveLength(2);
  });

  it("caps the preview at 50 rows but still reports the true total", () => {
    const rows = Array.from({ length: 80 }, (_, i) => `${utcDayString(-1)},Item ${i},100,Inventory`);
    const result = previewCsv(csv(rows));
    expect(result.totalRows).toBe(80);
    expect(result.previewRows).toHaveLength(50);
  });

  it("sends the whole file when it is shorter than the cap", () => {
    const rows = Array.from({ length: 35 }, (_, i) => `${utcDayString(-1)},Item ${i},100,Inventory`);
    const result = previewCsv(csv(rows));
    expect(result.totalRows).toBe(35);
    expect(result.previewRows).toHaveLength(35);
  });

  it("handles an empty file without throwing", () => {
    const result = previewCsv(Buffer.from("Transaction Date,Particulars,Cash Out,Class\n"));
    expect(result.totalRows).toBe(0);
    expect(result.previewRows).toEqual([]);
  });
});

describe("import of a wholly valid file", () => {
  it("imports every row and reports nothing skipped", async () => {
    const result = await importExpenses(
      csv([
        `${utcDayString(-1)},Supplier stocks,1400,Inventory`,
        `${utcDayString(-2)},Electric bill,900,Utilities`,
      ])
    );

    expect(result.totalRows).toBe(2);
    expect(result.imported).toBe(2);
    expect(result.skipped).toEqual([]);
    expect(result.status).toBe("Completed");
  });

  it("tags imported records with the CSV_UPLOAD source and links the batch", async () => {
    const result = await importExpenses(csv([`${utcDayString(-1)},Supplier stocks,1400,Inventory`]));

    const records = await prisma.expenseRecord.findMany({ where: { businessProfileId: ctx.profile.id } });
    expect(records).toHaveLength(1);
    expect(records[0]!.source).toBe("CSV_UPLOAD");
    expect(records[0]!.importBatchId).toBe(result.batchId);
  });

  it("resolves an existing category case-insensitively rather than duplicating it", async () => {
    await importExpenses(csv([`${utcDayString(-1)},Supplier stocks,1400,INVENTORY`]));

    const categories = await prisma.expenseCategory.findMany({ where: { businessProfileId: ctx.profile.id } });
    // Still just the two seeded categories — no "INVENTORY" duplicate.
    expect(categories).toHaveLength(2);
    const record = await prisma.expenseRecord.findFirstOrThrow({ where: { businessProfileId: ctx.profile.id } });
    expect(record.categoryId).toBe(ctx.categories.Inventory);
  });

  /*
   * Vendor: mappable, optional, and never a reason to skip a row.
   * ExpenseRecord.vendor is nullable and the Add Expense form marks it
   * optional, so an export without a supplier column has to import cleanly —
   * it just can't fill one in.
   */
  it("imports the vendor when a column is mapped to it", async () => {
    const buffer = Buffer.from(
      ["Transaction Date,Particulars,Cash Out,Class,Supplier", `${utcDayString(-1)},Rice,1400,Inventory,Aling Nena`].join("\n") + "\n",
    );
    await confirmImport(ctx.user.id, {
      businessProfileId: ctx.profile.id,
      recordType: "expense",
      title: "Vendor batch",
      buffer,
      originalname: "test.csv",
      columnMapping: { ...EXPENSE_MAPPING, vendor: "Supplier" },
    });

    const record = await prisma.expenseRecord.findFirstOrThrow({ where: { businessProfileId: ctx.profile.id } });
    expect(record.vendor).toBe("Aling Nena");
  });

  it("imports with no vendor at all when the column isn't mapped", async () => {
    const result = await importExpenses(csv([`${utcDayString(-1)},Rice,1400,Inventory`]));
    expect(result.imported).toBe(1);
    const record = await prisma.expenseRecord.findFirstOrThrow({ where: { businessProfileId: ctx.profile.id } });
    expect(record.vendor).toBeNull();
  });

  it("does not skip a row whose vendor cell is empty", async () => {
    const buffer = Buffer.from(
      [
        "Transaction Date,Particulars,Cash Out,Class,Supplier",
        `${utcDayString(-1)},Has vendor,1400,Inventory,Aling Nena`,
        `${utcDayString(-2)},No vendor,900,Inventory,`,
      ].join("\n") + "\n",
    );
    const result = await confirmImport(ctx.user.id, {
      businessProfileId: ctx.profile.id,
      recordType: "expense",
      title: "Vendor batch",
      buffer,
      originalname: "test.csv",
      columnMapping: { ...EXPENSE_MAPPING, vendor: "Supplier" },
    });

    expect(result.imported).toBe(2);
    expect(result.skipped).toEqual([]);
    const blank = await prisma.expenseRecord.findFirstOrThrow({
      where: { businessProfileId: ctx.profile.id, description: "No vendor" },
    });
    expect(blank.vendor).toBeNull();
  });

  it("stores dates at UTC midnight", async () => {
    const day = utcDayString(-1);
    await importExpenses(csv([`${day},Supplier stocks,1400,Inventory`]));
    const record = await prisma.expenseRecord.findFirstOrThrow({ where: { businessProfileId: ctx.profile.id } });
    expect(record.date.toISOString()).toBe(`${day}T00:00:00.000Z`);
  });
});

describe("import of a file with a mix of valid and invalid rows", () => {
  it("imports the good rows, skips the bad ones, and says which and why", async () => {
    const result = await importExpenses(
      csv([
        `${utcDayString(-1)},Good row one,1400,Inventory`,
        `,Missing date,900,Utilities`,
        `${utcDayString(-2)},Missing amount,,Inventory`,
        `${utcDayString(-3)},Bad amount,not-a-number,Inventory`,
        `${utcDayString(-4)},Good row two,700,Utilities`,
      ])
    );

    expect(result.totalRows).toBe(5);
    expect(result.imported).toBe(2);
    expect(result.skipped).toHaveLength(3);

    // Every skipped row carries a row number and a human-readable reason —
    // an owner has to be able to find and fix the offending line.
    for (const s of result.skipped) {
      expect(typeof s.row).toBe("number");
      expect(s.reason.length).toBeGreaterThan(0);
    }

    // Only the two good rows made it in.
    const records = await prisma.expenseRecord.findMany({ where: { businessProfileId: ctx.profile.id } });
    expect(records.map((r) => r.description).sort()).toEqual(["Good row one", "Good row two"]);
  });

  it("does not partially apply a bad row", async () => {
    await importExpenses(csv([`${utcDayString(-1)},Bad amount,not-a-number,Inventory`]));
    const records = await prisma.expenseRecord.findMany({ where: { businessProfileId: ctx.profile.id } });
    expect(records).toHaveLength(0);
  });

  it("marks the batch as needing review when rows were skipped", async () => {
    const result = await importExpenses(
      csv([`${utcDayString(-1)},Good row,1400,Inventory`, `,Missing date,900,Utilities`])
    );
    expect(result.skipped.length).toBeGreaterThan(0);
    expect(result.status).toBe("Needs Review");

    const batch = await prisma.cSVImportBatch.findUniqueOrThrow({ where: { id: result.batchId } });
    expect(batch.status).toBe("Needs Review");
  });

  /*
   * Corrections: the cells an owner retypes in the "rows won't import" panel,
   * applied over the uploaded file so a bad row can be rescued in the same
   * import rather than sending them back to Excel for a second round trip.
   */
  it("imports a row that a correction makes valid", async () => {
    const result = await importExpenses(
      csv([`${utcDayString(-1)},Good row,1400,Inventory`, `,Missing date,900,Utilities`]),
      "Fixed batch",
      { "3": { date: utcDayString(-2) } },
    );

    expect(result.imported).toBe(2);
    expect(result.skipped).toEqual([]);
    expect(result.status).toBe("Completed");

    const rescued = await prisma.expenseRecord.findFirstOrThrow({
      where: { businessProfileId: ctx.profile.id, description: "Missing date" },
    });
    expect(rescued.date.toISOString()).toBe(`${utcDayString(-2)}T00:00:00.000Z`);
  });

  it("can correct several fields of the same row at once", async () => {
    const result = await importExpenses(
      csv([`,Broken everywhere,not-a-number,`]),
      "Fixed batch",
      { "2": { date: utcDayString(-1), amount: "1250.50", category: "Utilities" } },
    );

    expect(result.imported).toBe(1);
    const record = await prisma.expenseRecord.findFirstOrThrow({ where: { businessProfileId: ctx.profile.id } });
    expect(Number(record.amount)).toBe(1250.5);
    expect(record.categoryId).toBe(ctx.categories.Utilities);
  });

  it("leaves untouched rows alone when correcting one", async () => {
    const result = await importExpenses(
      csv([`${utcDayString(-1)},Keep me,1400,Inventory`, `,Fix me,900,Utilities`]),
      "Fixed batch",
      { "3": { date: utcDayString(-2) } },
    );
    expect(result.imported).toBe(2);
    const kept = await prisma.expenseRecord.findFirstOrThrow({
      where: { businessProfileId: ctx.profile.id, description: "Keep me" },
    });
    expect(Number(kept.amount)).toBe(1400);
    expect(kept.date.toISOString()).toBe(`${utcDayString(-1)}T00:00:00.000Z`);
  });

  /**
   * The correction is data, not a bypass. A value that is still invalid gets
   * skipped with the same reason as if it had come out of the file that way —
   * so this cannot be used to push an unparseable amount into the database.
   */
  it("still skips a row whose correction is also invalid", async () => {
    const result = await importExpenses(
      csv([`${utcDayString(-1)},Bad amount,not-a-number,Inventory`]),
      "Fixed batch",
      { "2": { amount: "still-not-a-number" } },
    );
    expect(result.imported).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toContain("Invalid amount");
    expect(await prisma.expenseRecord.count({ where: { businessProfileId: ctx.profile.id } })).toBe(0);
  });

  it("ignores a correction for a row number that isn't in the file", async () => {
    const result = await importExpenses(csv([`${utcDayString(-1)},Only row,1400,Inventory`]), "Fixed batch", {
      "99": { amount: "5" },
    });
    expect(result.imported).toBe(1);
    const record = await prisma.expenseRecord.findFirstOrThrow({ where: { businessProfileId: ctx.profile.id } });
    expect(Number(record.amount)).toBe(1400);
  });

  it("creates a category named only in a correction", async () => {
    await importExpenses(csv([`${utcDayString(-1)},Needs a category,1400,`]), "Fixed batch", {
      "2": { category: "Transport" },
    });
    const created = await prisma.expenseCategory.findFirstOrThrow({
      where: { businessProfileId: ctx.profile.id, name: "Transport" },
    });
    const record = await prisma.expenseRecord.findFirstOrThrow({ where: { businessProfileId: ctx.profile.id } });
    expect(record.categoryId).toBe(created.id);
  });

  it("records the batch with a stored file reference (NOT NULL in the dictionary)", async () => {
    const result = await importExpenses(csv([`${utcDayString(-1)},Supplier stocks,1400,Inventory`]));
    const batch = await prisma.cSVImportBatch.findUniqueOrThrow({ where: { id: result.batchId } });
    expect(batch.fileReference).toBe("test/mock-csv-path.csv");
    expect(batch.title).toBe("Test batch");
  });
});

describe("imported rows still go through the normal flagging rules", () => {
  it("flags a large expense that arrives via CSV", async () => {
    // 20,000 is over 25% of 60,000.
    const result = await importExpenses(csv([`${utcDayString(-1)},Bulk delivery,20000,Inventory`]));
    expect(result.imported).toBe(1);
    expect(result.largeExpenseFlagged).toBe(1);
    // `flagged` counts possible duplicates only — this row is not one.
    expect(result.flagged).toBe(0);

    const record = await prisma.expenseRecord.findFirstOrThrow({ where: { businessProfileId: ctx.profile.id } });
    expect(record.largeExpenseFlag).toBe(true);
    expect(record.reviewStatus).toBe("Needs Review");
  });

  it("marks the batch Needs Review when its only flag is a large expense", async () => {
    // Regression guard. The batch status previously considered duplicates only,
    // so a batch of large expenses reported "Completed" while every record in
    // it was queued for review.
    const result = await importExpenses(csv([`${utcDayString(-1)},Bulk delivery,20000,Inventory`]));
    expect(result.skipped).toEqual([]);
    expect(result.flagged).toBe(0);
    expect(result.largeExpenseFlagged).toBe(1);
    expect(result.status).toBe("Needs Review");

    const batch = await prisma.cSVImportBatch.findUniqueOrThrow({ where: { id: result.batchId } });
    expect(batch.status).toBe("Needs Review");
  });

  it("still reports Completed for a clean batch with no flags at all", async () => {
    const result = await importExpenses(csv([`${utcDayString(-1)},Small item,100,Inventory`]));
    expect(result.skipped).toEqual([]);
    expect(result.flagged).toBe(0);
    expect(result.largeExpenseFlagged).toBe(0);
    expect(result.status).toBe("Completed");
  });

  it("flags a duplicate that arrives via CSV against an existing manual record", async () => {
    const day = utcDayString(-1);
    await importExpenses(csv([`${day},Supplier stocks,1400,Inventory`]), "First batch");
    const second = await importExpenses(csv([`${day},Supplier stocks,1400,Inventory`]), "Second batch");

    expect(second.imported).toBe(1);
    expect(second.flagged).toBeGreaterThan(0);

    const records = await prisma.expenseRecord.findMany({
      where: { businessProfileId: ctx.profile.id },
      orderBy: { id: "asc" },
    });
    expect(records).toHaveLength(2);
    expect(records[1]!.duplicateStatus).toBe("Flagged");
    expect(records[1]!.duplicateOfRecordId).toBe(records[0]!.id);
  });

  /**
   * Two identical rows inside ONE file.
   *
   * This used to be free: rows were inserted one at a time, so the second
   * row's duplicate SELECT could already see the first. The batched import
   * inserts them together, which means nothing in the database distinguishes
   * them at insert time and the link has to be worked out in memory and
   * written back afterwards — so it is worth a test of its own.
   */
  it("flags a row that duplicates an earlier row of the SAME file", async () => {
    const day = utcDayString(-1);
    const result = await importExpenses(
      csv([
        `${day},Supplier stocks,1400,Inventory`,
        `${day},Different thing,900,Inventory`,
        `${day},Supplier stocks,1400,Inventory`,
      ]),
      "One batch",
    );

    expect(result.imported).toBe(3);
    expect(result.flagged).toBe(1);

    const records = await prisma.expenseRecord.findMany({
      where: { businessProfileId: ctx.profile.id },
      orderBy: { id: "asc" },
    });
    expect(records).toHaveLength(3);
    // First occurrence is clean, the unrelated row is clean, the repeat is flagged
    // and points back at the first occurrence — not at itself, and not at null.
    expect(records[0]!.duplicateStatus).toBe("Not a Duplicate");
    expect(records[1]!.duplicateStatus).toBe("Not a Duplicate");
    expect(records[2]!.duplicateStatus).toBe("Flagged");
    expect(records[2]!.duplicateOfRecordId).toBe(records[0]!.id);
  });

  it("raises one notification per flag, linked to the record it is about", async () => {
    const day = utcDayString(-1);
    await importExpenses(csv([`${day},Supplier stocks,1400,Inventory`, `${day},Supplier stocks,1400,Inventory`]), "Batch");

    const notifications = await prisma.notification.findMany({
      where: { businessProfileId: ctx.profile.id, type: "Possible Duplicate" },
    });
    expect(notifications).toHaveLength(1);
    const flagged = await prisma.expenseRecord.findFirst({
      where: { businessProfileId: ctx.profile.id, duplicateStatus: "Flagged" },
    });
    expect(notifications[0]!.expenseRecordId).toBe(flagged!.id);
  });
});

describe("sales imports", () => {
  it("imports sales reference records without needing a category column", async () => {
    const buffer = Buffer.from(
      ["Transaction Date,Particulars,Cash In", `${utcDayString(-1)},Daily sales,5000`].join("\n") + "\n"
    );
    const result = await confirmImport(ctx.user.id, {
      businessProfileId: ctx.profile.id,
      recordType: "sales",
      title: "Sales batch",
      buffer,
      originalname: "sales.csv",
      columnMapping: { date: "Transaction Date", description: "Particulars", amount: "Cash In" },
    });

    expect(result.imported).toBe(1);
    const records = await prisma.salesReferenceRecord.findMany({ where: { businessProfileId: ctx.profile.id } });
    expect(records).toHaveLength(1);
    expect(records[0]!.source).toBe("CSV_UPLOAD");
    // No expense records were created by a sales import.
    expect(await prisma.expenseRecord.count({ where: { businessProfileId: ctx.profile.id } })).toBe(0);
  });
});

describe("ownership", () => {
  it("refuses to import into another owner's business profile, with 404 not 403", async () => {
    const other = await makeOwnerWithProfile();
    await expect(
      confirmImport(ctx.user.id, {
        businessProfileId: other.profile.id,
        recordType: "expense",
        title: "Hijack attempt",
        buffer: csv([`${utcDayString(-1)},Supplier stocks,1400,Inventory`]),
        originalname: "test.csv",
        columnMapping: EXPENSE_MAPPING,
      })
    ).rejects.toMatchObject({ status: 404 });

    // Nothing was written to the victim's profile.
    expect(await prisma.expenseRecord.count({ where: { businessProfileId: other.profile.id } })).toBe(0);
    expect(await prisma.cSVImportBatch.count({ where: { businessProfileId: other.profile.id } })).toBe(0);
  });
});
