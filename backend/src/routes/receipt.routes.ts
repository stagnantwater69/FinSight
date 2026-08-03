import { Router } from "express";
import * as receiptScanController from "../controllers/receiptScan.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { uploadReceiptImage } from "../middleware/upload.middleware";
import { LIMITS, rateLimit } from "../middleware/rateLimit.middleware";
import { asyncHandler } from "../lib/asyncHandler";
import { MAX_PAGES } from "../services/receiptScan.service";

export const receiptRouter = Router();

receiptRouter.use(requireAuth);

/*
 * The most expensive request in the product: OCR per page, then possibly a
 * vision model re-read, then the categoriser. Limited BEFORE multer so a
 * rejected burst does not even pay to parse the uploaded images off the wire.
 *
 * `.array("files", MAX_PAGES)` accepts one photo the same way it always has —
 * a single-element array — or up to MAX_PAGES for a long receipt. There is no
 * separate single-file route to keep in sync with this one.
 */
receiptRouter.post(
  "/",
  rateLimit(LIMITS.SCAN_RECEIPT_BURST),
  rateLimit(LIMITS.SCAN_RECEIPT_HOURLY),
  uploadReceiptImage.array("files", MAX_PAGES),
  asyncHandler(receiptScanController.upload),
);
/*
 * One photo's own readability, checked the moment it is taken — see the
 * controller for why this is separate from the full upload.
 */
receiptRouter.post(
  "/quality-check",
  rateLimit(LIMITS.QUALITY_CHECK_BURST),
  uploadReceiptImage.single("file"),
  asyncHandler(receiptScanController.checkQuality),
);
receiptRouter.delete("/:id/items/:itemId", asyncHandler(receiptScanController.deleteItem));
receiptRouter.post("/:id/confirm", asyncHandler(receiptScanController.confirm));
