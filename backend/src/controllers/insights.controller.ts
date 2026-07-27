import type { Request, Response } from "express";
import { z } from "zod";
import * as insightsService from "../services/insights.service";

const periodQuerySchema = z.object({
  businessProfileId: z.coerce.number().int().positive(),
  periodDays: z.coerce.number().int().positive().max(366).default(30),
});

// Recovery is month-to-date, so there is no period to select — coverageDays
// only controls how many recent days the daily-coverage table shows.
const recoveryQuerySchema = z.object({
  businessProfileId: z.coerce.number().int().positive(),
  coverageDays: z.coerce.number().int().positive().max(31).default(14),
});

const spendingImpactQuerySchema = z.object({
  businessProfileId: z.coerce.number().int().positive(),
  plannedAmount: z.coerce.number().nonnegative(),
  periodDays: z.coerce.number().int().positive().max(366).default(30),
});

export async function expenseBehavior(req: Request, res: Response) {
  const query = periodQuerySchema.parse(req.query);
  const result = await insightsService.getExpenseBehavior(req.user!.id, query.businessProfileId, query.periodDays);
  res.status(200).json(result);
}

export async function recoveryInsight(req: Request, res: Response) {
  const query = recoveryQuerySchema.parse(req.query);
  const result = await insightsService.getRecoveryInsight(req.user!.id, query.businessProfileId, query.coverageDays);
  res.status(200).json(result);
}

export async function spendingImpact(req: Request, res: Response) {
  const query = spendingImpactQuerySchema.parse(req.query);
  const result = await insightsService.simulateSpendingImpact(
    req.user!.id,
    query.businessProfileId,
    query.plannedAmount,
    query.periodDays
  );
  res.status(200).json(capPercentOfFunds(result));
}

// JSON has no Infinity — cap it to a clearly-synthetic large number the
// client can special-case, rather than silently losing the value to null.
export function capPercentOfFunds<T extends { percentOfFunds: number }>(result: T): T {
  return { ...result, percentOfFunds: Number.isFinite(result.percentOfFunds) ? result.percentOfFunds : 999999 };
}
