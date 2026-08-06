import type { Request, Response } from "express";
import { z } from "zod";
import * as dashboardService from "../services/dashboard.service";

const summaryQuerySchema = z.object({
  businessProfileId: z.coerce.number().int().positive(),
  periodDays: z.coerce.number().int().positive().max(366).default(30),
});

export async function summary(req: Request, res: Response) {
  const query = summaryQuerySchema.parse(req.query);
  const result = await dashboardService.getDashboardSummary(req.user!.id, query.businessProfileId, query.periodDays);
  res.status(200).json(result);
}

const cashflowQuerySchema = z.object({
  businessProfileId: z.coerce.number().int().positive(),
  granularity: z.enum(["daily", "monthly"]).default("daily"),
});

export async function cashflow(req: Request, res: Response) {
  const query = cashflowQuerySchema.parse(req.query);
  const result = await dashboardService.getDashboardCashflow(req.user!.id, query.businessProfileId, query.granularity);
  res.status(200).json(result);
}
