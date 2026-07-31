import { Router } from "express";
import * as aiController from "../controllers/ai.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { asyncHandler } from "../lib/asyncHandler";

export const aiRouter = Router();

aiRouter.use(requireAuth);

aiRouter.post("/ask", asyncHandler(aiController.ask));
aiRouter.get("/history", asyncHandler(aiController.history));
aiRouter.post("/suggest-category", asyncHandler(aiController.suggestCategory));
