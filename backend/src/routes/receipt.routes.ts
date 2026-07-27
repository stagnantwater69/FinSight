import { Router } from "express";
import * as receiptScanController from "../controllers/receiptScan.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { uploadReceiptImage } from "../middleware/upload.middleware";
import { asyncHandler } from "../lib/asyncHandler";

export const receiptRouter = Router();

receiptRouter.use(requireAuth);

receiptRouter.post("/", uploadReceiptImage.single("file"), asyncHandler(receiptScanController.upload));
receiptRouter.post("/:id/confirm", asyncHandler(receiptScanController.confirm));
