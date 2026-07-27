import type { Request, Response } from "express";
import { z } from "zod";
import * as receiptScanService from "../services/receiptScan.service";
import { ApiError } from "../middleware/error.middleware";

const uploadSchema = z.object({
  businessProfileId: z.coerce.number().int().positive(),
});

const confirmSchema = z.object({
  categoryId: z.number().int().positive(),
  date: z.string().date(),
  description: z.string().min(1).max(255),
  vendor: z.string().max(150).optional(),
  amount: z.number().positive(),
});

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, "Invalid receipt scan id");
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

export async function confirm(req: Request, res: Response) {
  const id = parseId(req.params.id!);
  const input = confirmSchema.parse(req.body);
  const record = await receiptScanService.confirmReceipt(req.user!.id, id, input);
  res.status(201).json(record);
}
