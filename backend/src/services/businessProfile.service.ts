import { prisma } from "../config/prisma";
import { ApiError } from "../middleware/error.middleware";
import type { BusinessProfile } from "@prisma/client";

interface CreateInput {
  name: string;
  type: string;
  availableFunds: number;
  expectedMonthlyExpenses: number;
  operatingDays: number;
  largeExpenseThresholdPercent?: number;
}

interface UpdateInput {
  name?: string;
  type?: string;
  availableFunds?: number;
  expectedMonthlyExpenses?: number;
  operatingDays?: number;
  largeExpenseThresholdPercent?: number;
}

function toDTO(profile: BusinessProfile) {
  return {
    id: profile.id,
    name: profile.name,
    type: profile.type,
    availableFunds: Number(profile.availableFunds),
    expectedMonthlyExpenses: Number(profile.expectedMonthlyExpenses),
    operatingDays: profile.operatingDays,
    largeExpenseThresholdPercent: Number(profile.largeExpenseThresholdPercent),
    createdAt: profile.createdAt,
    archivedAt: profile.archivedAt,
    isArchived: profile.archivedAt !== null,
  };
}

// Never distinguish "doesn't exist" from "exists but belongs to someone
// else" in the error — both return 404, so ownership can't be probed.
async function findOwned(userId: number, id: number): Promise<BusinessProfile> {
  const profile = await prisma.businessProfile.findFirst({ where: { id, userId } });
  if (!profile) {
    throw new ApiError(404, "Business profile not found");
  }
  return profile;
}

export async function createBusinessProfile(userId: number, input: CreateInput) {
  const profile = await prisma.businessProfile.create({
    data: { userId, ...input },
  });
  return toDTO(profile);
}

export async function listBusinessProfiles(userId: number, includeArchived = false) {
  const profiles = await prisma.businessProfile.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: { createdAt: "asc" },
  });
  return profiles.map(toDTO);
}

/**
 * Soft delete. The profile and every record, insight and AI conversation
 * attached to it are left completely intact — only its visibility changes.
 *
 * There is deliberately no hard delete anywhere in this app. Every child
 * relation cascades from BusinessProfile, so a real delete would wipe an
 * owner's entire financial history for that business in one irreversible
 * click. For a tool whose value IS that history, archive is the correct
 * destructive-action ceiling.
 */
export async function archiveBusinessProfile(userId: number, id: number) {
  const existing = await findOwned(userId, id);
  if (existing.archivedAt) {
    return toDTO(existing); // already archived — idempotent, not an error
  }
  const profile = await prisma.businessProfile.update({
    where: { id },
    data: { archivedAt: new Date() },
  });
  return toDTO(profile);
}

export async function restoreBusinessProfile(userId: number, id: number) {
  const existing = await findOwned(userId, id);
  if (!existing.archivedAt) {
    return toDTO(existing); // already active — idempotent
  }
  const profile = await prisma.businessProfile.update({
    where: { id },
    data: { archivedAt: null },
  });
  return toDTO(profile);
}

export async function getBusinessProfile(userId: number, id: number) {
  const profile = await findOwned(userId, id);
  return toDTO(profile);
}

export async function updateBusinessProfile(userId: number, id: number, input: UpdateInput) {
  await findOwned(userId, id);
  const profile = await prisma.businessProfile.update({ where: { id }, data: input });
  return toDTO(profile);
}
