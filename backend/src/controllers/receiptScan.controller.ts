import type { Request, Response } from "express";
import { z } from "zod";
import * as receiptScanService from "../services/receiptScan.service";
import { assessImageQuality } from "../lib/imageQuality";
import { ApiError } from "../middleware/error.middleware";

const uploadSchema = z.object({
  businessProfileId: z.coerce.number().int().positive(),
});

/**
 * Exported so the contract tests can check real client payloads against the
 * real schema rather than a copy of it.
 *
 * This endpoint has already broken a client silently once: mobile posted a
 * `categoryId` long after this schema stopped accepting one, and because zod
 * strips unknown keys instead of rejecting them, the field vanished without
 * an error and every mobile receipt confirmation failed. A copy of the schema
 * in a test would have drifted the same way the client did.
 */
export const confirmSchema = z.object({
  date: z.string().date(),
  description: z.string().min(1).max(255),
  vendor: z.string().max(150).optional(),
  amount: z.number().positive(),
  // Either shape is accepted, and the service requires that one of them
  // resolves to at least one category. `splits` is the manual path (a
  // single-category receipt is just a split of one); `itemAssignments` is
  // the itemised path, where the server does the grouping itself.
  splits: z
    .array(
      z.object({
        categoryId: z.number().int().positive(),
        amount: z.number().positive(),
        description: z.string().min(1).max(255).optional(),
      }),
    )
    .optional(),
  itemAssignments: z
    .array(
      z.object({
        itemId: z.number().int().positive(),
        categoryId: z.number().int().positive(),
      }),
    )
    .optional(),
  // Lines the owner typed in because OCR missed them. Same field constraints
  // as an extracted item, since they end up in the same table.
  additionalItems: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        amount: z.number().positive(),
        categoryId: z.number().int().positive(),
      }),
    )
    .optional(),
  // How to account for any difference between the items and the confirmed
  // total. A discriminated union so "category" cannot arrive without the
  // category it needs, and the other modes cannot smuggle one in.
  reconciliation: z
    .discriminatedUnion("mode", [
      z.object({ mode: z.literal("proportional") }),
      z.object({ mode: z.literal("category"), categoryId: z.number().int().positive() }),
      z.object({ mode: z.literal("none") }),
    ])
    .optional(),
})
  /*
   * Unknown keys are REJECTED here, not quietly dropped.
   *
   * Zod's default is to strip them, and that default is what turned a small
   * client mistake into a mystery: mobile kept sending `categoryId` after this
   * endpoint moved to splits, the field was silently discarded, and the owner
   * saw "Assign the receipt to at least one category" on a screen where they
   * had very obviously assigned one. The real fault — a field the server no
   * longer understood — was never mentioned to anyone.
   *
   * Refusing costs nothing when a client is correct, and when one is wrong it
   * names the offending key instead of failing somewhere unrelated. Both
   * clients are checked against this in tests/contract/clientPayloads.test.ts.
   */
  .strict();

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, "Invalid receipt scan id");
  }
  return id;
}

function parseItemId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, "Invalid receipt scan item id");
  }
  return id;
}

export async function upload(req: Request, res: Response) {
  // multer's .array() always sets req.files to an array (possibly empty),
  // never to req.file — checking both is what lets this controller serve
  // both the field name older clients might still send and the current one.
  const files = Array.isArray(req.files) ? req.files : req.file ? [req.file] : [];
  if (files.length === 0) {
    throw new ApiError(400, "At least one receipt photo is required");
  }
  const { businessProfileId } = uploadSchema.parse(req.body);

  const scan = await receiptScanService.uploadAndScan(req.user!.id, {
    businessProfileId,
    pages: files.map((file) => ({
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
    })),
  });

  res.status(201).json(scan);
}

/**
 * A single page's own readability, with none of the rest of the pipeline —
 * no OCR, no vision call, no storage write, no database row.
 *
 * WHY THIS EXISTS SEPARATELY FROM `upload`. A capture session takes its
 * photos one at a time, and a blurry page is far cheaper to catch while the
 * camera is still open than after the whole set has been OCR'd — retaking
 * costs a tap; discovering it later costs an OCR pass, a possible vision
 * call, and a wrong set of figures the owner has to notice and undo. This
 * gives the client that answer after every shutter press, not only once at
 * the end.
 */
export async function checkQuality(req: Request, res: Response) {
  if (!req.file) {
    throw new ApiError(400, "A photo is required");
  }
  const quality = await assessImageQuality(req.file.buffer);
  res.status(200).json(quality);
}

/**
 * Returns the scan as it now stands rather than 204, so the review screen
 * re-renders from the server's list instead of its own optimistic copy.
 */
export async function deleteItem(req: Request, res: Response) {
  const id = parseId(req.params.id!);
  const itemId = parseItemId(req.params.itemId!);
  const scan = await receiptScanService.deleteScanItem(req.user!.id, id, itemId);
  res.json(scan);
}

export async function confirm(req: Request, res: Response) {
  const id = parseId(req.params.id!);
  const input = confirmSchema.parse(req.body);
  const records = await receiptScanService.confirmReceipt(req.user!.id, id, input);
  res.status(201).json(records);
}
