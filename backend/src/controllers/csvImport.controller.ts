import type { Request, Response } from "express";
import { z } from "zod";
import * as csvImportService from "../services/csvImport.service";
import { ApiError } from "../middleware/error.middleware";

const columnMappingSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  amount: z.string().min(1),
  category: z.string().min(1).optional(),
  vendor: z.string().min(1).optional(),
});

/**
 * Fixes the owner typed into the "rows that need fixing" panel, keyed by the
 * spreadsheet row number the skip report uses.
 *
 * Deliberately a patch over the uploaded file rather than a replacement for
 * it: the file itself is still what gets stored as the batch's
 * fileReference, the server still parses and validates it, and a correction
 * can only supply the same kind of raw cell text the CSV would have held. So
 * this cannot be used to smuggle past a validation rule — a corrected row is
 * checked exactly as an original one is, and stays skipped if it is still
 * wrong.
 */
const correctionsSchema = z.record(
  z.string().regex(/^\d+$/, "Correction keys are row numbers"),
  z.object({
    date: z.string().max(100).optional(),
    description: z.string().max(255).optional(),
    amount: z.string().max(50).optional(),
    category: z.string().max(100).optional(),
  }),
);

function jsonField<T extends z.ZodTypeAny>(name: string, shape: T) {
  return z
    .string()
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw);
      } catch {
        ctx.addIssue({ code: "custom", message: `${name} must be valid JSON` });
        return z.NEVER;
      }
    })
    .pipe(shape);
}

const confirmSchema = z.object({
  businessProfileId: z.coerce.number().int().positive(),
  recordType: z.enum(["expense", "sales"]),
  title: z.string().min(1).max(150),
  columnMapping: jsonField("columnMapping", columnMappingSchema),
  corrections: jsonField("corrections", correctionsSchema).optional(),
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
    corrections: input.corrections,
  });

  res.status(201).json(result);
}
