import { Router } from "express";
import * as receiptScanController from "../controllers/receiptScan.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { uploadReceiptImage } from "../middleware/upload.middleware";
import { LIMITS, rateLimit } from "../middleware/rateLimit.middleware";
import { asyncHandler } from "../lib/asyncHandler";

export const receiptRouter = Router();

receiptRouter.use(requireAuth);

/*
 * The most expensive request in the product: OCR, then possibly a vision model
 * re-read, then the categoriser. Limited BEFORE multer so a rejected burst
 * does not even pay to parse the uploaded image off the wire.
 */
receiptRouter.post(
  "/",
  rateLimit(LIMITS.SCAN_RECEIPT_BURST),
  rateLimit(LIMITS.SCAN_RECEIPT_HOURLY),
  uploadReceiptImage.single("file"),
  asyncHandler(receiptScanController.upload),
);
receiptRouter.delete("/:id/items/:itemId", asyncHandler(receiptScanController.deleteItem));
receiptRouter.post("/:id/confirm", asyncHandler(receiptScanController.confirm));
