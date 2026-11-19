import { Router } from "express";
import * as recordsController from "../controllers/records.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { LIMITS, limitAuthenticatedWrites, rateLimits } from "../middleware/rateLimit.middleware";
import { asyncHandler } from "../lib/asyncHandler";

export const recordsRouter = Router();

recordsRouter.use(requireAuth);
recordsRouter.use(limitAuthenticatedWrites);

recordsRouter.get("/search", asyncHandler(recordsController.search));
recordsRouter.get("/months", asyncHandler(recordsController.months));
recordsRouter.get("/future-dated", asyncHandler(recordsController.futureDated));
recordsRouter.get("/flagged", asyncHandler(recordsController.flagged));
recordsRouter.get("/flagged/count", asyncHandler(recordsController.flaggedCount));
recordsRouter.get("/export/months", asyncHandler(recordsController.exportMonths));
recordsRouter.get(
  "/export",
  rateLimits(LIMITS.RECORDS_EXPORT, LIMITS.RECORDS_EXPORT_HOURLY),
  asyncHandler(recordsController.exportCsv),
);
recordsRouter.post("/duplicates/resolve", asyncHandler(recordsController.resolveDuplicates));
