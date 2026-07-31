import type { Request, Response } from "express";
import { z } from "zod";
import * as receiptScanService from "../services/receiptScan.service";
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
  if (!req.file) {
    throw new ApiError(400, "Receipt image file is required");
  }
  const { businessProfileId } = uploadSchema.parse(req.body);

  const scan = await receiptScanService.uploadAndScan(req.user!.id, {
    businessProfileId,
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
    originalname: req.file.originalname,
  });

  res.status(201).json(scan);
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
