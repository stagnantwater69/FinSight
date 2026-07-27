import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/config/prisma";

// Tables in dependency order isn't needed — one TRUNCATE ... CASCADE with
// RESTART IDENTITY resets both rows and the id sequences, so tests can assert
// on predictable ids and never leak state into the next file.
const TABLES = [
  "AIInteraction",
  "Notification",
  "CSVImportBatch",
  "ReceiptScan",
  "SalesReferenceRecord",
  "ExpenseRecord",
  "ExpenseCategory",
  "BusinessProfile",
  "User",
];

export async function resetDb() {
  const list = TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
}

export async function disconnectDb() {
  await prisma.$disconnect();
}

// ---------------------------------------------------------------
// Factories
// ---------------------------------------------------------------
// Written against Prisma directly rather than through the services, so a test
// can set up arbitrary state (including states the API wouldn't normally
// produce) without the setup itself depending on the code under test.

export async function makeUser(overrides: { email?: string } = {}) {
  const email = overrides.email ?? `test-${randomUUID()}@example.com`;
  return prisma.user.create({
    data: {
      authId: randomUUID(),
      firstName: "Test",
      lastName: "Owner",
      email,
    },
  });
}

export interface ProfileOverrides {
  name?: string;
  availableFunds?: number;
  expectedMonthlyExpenses?: number;
  operatingDays?: number;
  largeExpenseThresholdPercent?: number;
}

export async function makeProfile(userId: number, overrides: ProfileOverrides = {}) {
  return prisma.businessProfile.create({
    data: {
      userId,
      name: overrides.name ?? "Test Store",
      type: "Sari-Sari Store",
      availableFunds: new Prisma.Decimal(overrides.availableFunds ?? 48500),
      expectedMonthlyExpenses: new Prisma.Decimal(overrides.expectedMonthlyExpenses ?? 125000),
      operatingDays: overrides.operatingDays ?? 25,
      largeExpenseThresholdPercent: new Prisma.Decimal(overrides.largeExpenseThresholdPercent ?? 25),
    },
  });
}

export async function makeCategory(businessProfileId: number, name: string) {
  return prisma.expenseCategory.create({ data: { businessProfileId, name } });
}

/** A whole owner + profile + categories in one call, for the common case. */
export async function makeOwnerWithProfile(
  profileOverrides: ProfileOverrides = {},
  categoryNames: string[] = ["Inventory", "Utilities"]
) {
  const user = await makeUser();
  const profile = await makeProfile(user.id, profileOverrides);
  const categories: Record<string, number> = {};
  for (const name of categoryNames) {
    categories[name] = (await makeCategory(profile.id, name)).id;
  }
  return { user, profile, categories };
}

// ---------------------------------------------------------------
// Dates
// ---------------------------------------------------------------
// Record dates are date-only values stored at UTC midnight. Test helpers must
// build them the same way — using local-time getters here is the exact bug that
// was found hiding today's records from the dashboard.

export function utcDay(offsetDays = 0): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

/** "YYYY-MM-DD" for a day offset from today, as the API accepts. */
export function utcDayString(offsetDays = 0): string {
  return utcDay(offsetDays).toISOString().slice(0, 10);
}
