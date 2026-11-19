import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
const authUserId = vi.hoisted(() => ({ value: "" }));
vi.mock("../../src/config/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/config/supabase")>();
  return { ...actual, supabaseAdmin: { auth: { getUser: async () => ({ data: { user: { id: authUserId.value } }, error: null }) } } };
});

import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import { disconnectDb, makeOwnerWithProfile, resetDb } from "../setup/testDb";
import { resetRateLimits } from "../../src/middleware/rateLimit.middleware";

const AUTH = ["Authorization", "Bearer synthetic-token"] as const;
const EXPORT = "/api/v1/records/export";
let owner: Awaited<ReturnType<typeof makeOwnerWithProfile>>;
let other: Awaited<ReturnType<typeof makeOwnerWithProfile>>;

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

beforeEach(async () => {
  // The export limit is 10 a minute; this file makes more than that between tests.
  resetRateLimits();
  await resetDb();
  owner = await makeOwnerWithProfile();
  other = await makeOwnerWithProfile();
  authUserId.value = owner.user.authId;
  await prisma.expenseRecord.create({ data: {
    businessProfileId: owner.profile.id, categoryId: owner.categories.Inventory!, date: day("2026-03-02"),
    description: "=cmd|' /C calc'!A0", vendor: "Ñino's Store", amount: "1234.50", source: "MANUAL_ENTRY", reviewStatus: "Reviewed",
  } });
  await prisma.salesReferenceRecord.create({ data: {
    businessProfileId: owner.profile.id, date: day("2026-03-01"), description: "Daily sales, cash",
    amount: "800.00", source: "MANUAL_ENTRY", reviewStatus: "Reviewed",
  } });
  await prisma.expenseRecord.create({ data: {
    businessProfileId: other.profile.id, categoryId: other.categories.Inventory!, date: day("2026-03-02"),
    description: "Someone else's expense", amount: "999.99", source: "MANUAL_ENTRY", reviewStatus: "Reviewed",
  } });
});
afterAll(disconnectDb);

describe("GET /records/export", () => {
  it("returns the owner's records as a UTF-8 CSV attachment, oldest first", async () => {
    const res = await request(app).get(EXPORT).set(...AUTH).query({ businessProfileId: owner.profile.id }).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="finsight-records\.csv"$/);
    const body = (res.body as Buffer);
    expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = body.toString("utf8").slice(1).trimEnd().split("\r\n");
    expect(lines).toEqual([
      "Date,Type,Description,Vendor,Category,Amount,Source,Review status",
      '2026-03-01,Sales,"Daily sales, cash",,,800.00,Manual Entry,Reviewed',
      "2026-03-02,Expense,'=cmd|' /C calc'!A0,Ñino's Store,Inventory,1234.50,Manual Entry,Reviewed",
    ]);
  });

  it("applies type and date filters", async () => {
    const res = await request(app).get(EXPORT).set(...AUTH)
      .query({ businessProfileId: owner.profile.id, type: "sales", dateFrom: "2026-03-01", dateTo: "2026-03-01" });
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("Expense");
    expect(res.text).toContain("800.00");
  });

  it("answers 404 for another owner's business and never leaks its rows", async () => {
    const res = await request(app).get(EXPORT).set(...AUTH).query({ businessProfileId: other.profile.id });
    expect(res.status).toBe(404);
    expect(res.text).not.toContain("Someone else's expense");
  });

  it("rejects an invalid date with 400", async () => {
    const res = await request(app).get(EXPORT).set(...AUTH).query({ businessProfileId: owner.profile.id, dateFrom: "03/01/2026" });
    expect(res.status).toBe(400);
  });

  it("lists months with how many of each kind they hold, newest first, for the owner only", async () => {
    await prisma.expenseRecord.create({ data: {
      businessProfileId: owner.profile.id, categoryId: owner.categories.Inventory!, date: day("2026-05-31"),
      description: "Late May stock", amount: "50.00", source: "MANUAL_ENTRY", reviewStatus: "Reviewed",
    } });
    const res = await request(app).get(`${EXPORT}/months`).set(...AUTH).query({ businessProfileId: owner.profile.id });
    expect(res.status).toBe(200);
    expect(res.body.months).toEqual([
      { month: "2026-05", expenses: 1, sales: 0 },
      { month: "2026-03", expenses: 1, sales: 1 },
    ]);
    const foreign = await request(app).get(`${EXPORT}/months`).set(...AUTH).query({ businessProfileId: other.profile.id });
    expect(foreign.status).toBe(404);
  });

  it("exports only the chosen months, gaps allowed, with every day of each month", async () => {
    await prisma.expenseRecord.createMany({ data: ["2026-04-15", "2026-05-01", "2026-05-31", "2026-06-01"].map((iso) => ({
      businessProfileId: owner.profile.id, categoryId: owner.categories.Inventory!, date: day(iso),
      description: `Stock ${iso}`, amount: "5.00", source: "MANUAL_ENTRY" as const, reviewStatus: "Reviewed" as const,
    })) });
    const res = await request(app).get(EXPORT).set(...AUTH).query({ businessProfileId: owner.profile.id, months: "2026-05,2026-03" });
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain('filename="finsight-records-2026-03-to-2026-05.csv"');
    const dates = res.text.replace(/^﻿/, "").trimEnd().split("\r\n").slice(1).map((row) => row.slice(0, 10));
    // March's two records, then the first and last day of May; April and June are left out.
    expect(dates).toEqual(["2026-03-01", "2026-03-02", "2026-05-01", "2026-05-31"]);
  });

  it.each(["2026-13", "2026-1", "march", ""])("rejects a malformed month list (%j) with 400", async (months) => {
    const res = await request(app).get(EXPORT).set(...AUTH).query({ businessProfileId: owner.profile.id, months });
    expect(res.status).toBe(400);
  });

  it("streams more than one page of rows from both tables in ledger order", async () => {
    // 1,203 expenses and 1,201 sales over two months: past the 1,000-row page
    // on both sides, so the merge has to interleave pages, not just rows.
    await prisma.expenseRecord.createMany({ data: Array.from({ length: 1_202 }, (_, i) => ({
      businessProfileId: owner.profile.id, categoryId: owner.categories.Inventory!, date: day(`2026-0${4 + (i % 2)}-${String(1 + (i % 28)).padStart(2, "0")}`),
      description: `Bulk expense ${i}`, amount: "10.00", source: "CSV_UPLOAD" as const, reviewStatus: "Reviewed" as const,
    })) });
    await prisma.salesReferenceRecord.createMany({ data: Array.from({ length: 1_200 }, (_, i) => ({
      businessProfileId: owner.profile.id, date: day(`2026-0${4 + (i % 2)}-${String(1 + (i % 28)).padStart(2, "0")}`),
      description: `Bulk sale ${i}`, amount: "20.00", source: "CSV_UPLOAD" as const, reviewStatus: "Reviewed" as const,
    })) });
    const res = await request(app).get(EXPORT).set(...AUTH).query({ businessProfileId: owner.profile.id });
    expect(res.status).toBe(200);
    const rows = res.text.replace(/^\uFEFF/, "").trimEnd().split("\r\n").slice(1);
    expect(rows).toHaveLength(1_203 + 1_201);
    const keys = rows.map((row) => `${row.slice(0, 10)}|${row.slice(11, 18) === "Expense" ? 0 : 1}`);
    expect(keys).toEqual([...keys].sort());
  });

  it("refuses an export larger than a spreadsheet can open, as a JSON error", async () => {
    const count = vi.spyOn(prisma.expenseRecord, "count").mockResolvedValueOnce(1_000_001);
    const res = await request(app).get(EXPORT).set(...AUTH).query({ businessProfileId: owner.profile.id, type: "expense" });
    count.mockRestore();
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(JSON.stringify(res.body)).toContain("1,000,001 records");
  });

  it("cuts the connection when a read fails mid-file, so no partial file arrives as complete", async () => {
    const findMany = vi.spyOn(prisma.expenseRecord, "findMany").mockRejectedValueOnce(new Error("database went away"));
    await expect(request(app).get(EXPORT).set(...AUTH).query({ businessProfileId: owner.profile.id, type: "expense" })).rejects.toThrow();
    findMany.mockRestore();
  });
});
