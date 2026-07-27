import type { Request, Response } from "express";
import { z } from "zod";
import * as csvImportService from "../services/csvImport.service";
import { ApiError } from "../middleware/error.middleware";

const columnMappingSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  amount: z.string().min(1),
  category: z.string().min(1).optional(),
});

const confirmSchema = z.object({
  businessProfileId: z.coerce.number().int().positive(),
  recordType: z.enum(["expense", "sales"]),
  title: z.string().min(1).max(150),
  columnMapping: z
    .string()
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw);
      } catch {
        ctx.addIssue({ code: "custom", message: "columnMapping must be valid JSON" });
        return z.NEVER;
      }
    })
    .pipe(columnMappingSchema),
});

export async function preview(req: Request, res: Response) {
  if (!req.file) {
    throw new ApiError(400, "CSV file is required");
  }
  const result = csvImportService.previewCsv(req.file.buffer);
  res.status(200).json(result);
}

export async function confirm(req: Request, res: Response) {
  if (!req.file) {
    throw new ApiError(400, "CSV file is required");
  }
  const input = confirmSchema.parse(req.body);
  if (input.recordType === "expense" && !input.columnMapping.category) {
    throw new ApiError(400, "columnMapping.category is required for expense imports");
  }

  const result = await csvImportService.confirmImport(req.user!.id, {
    businessProfileId: input.businessProfileId,
    recordType: input.recordType,
    title: input.title,
    buffer: req.file.buffer,
    originalname: req.file.originalname,
    columnMapping: input.columnMapping,
  });

  res.status(201).json(result);
}
