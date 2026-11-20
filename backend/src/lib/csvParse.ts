import { parse } from "csv-parse/sync";
import { ApiError } from "./apiError";
import { CSV_MAX_FILE_BYTES, decodeCsvUploadBytes } from "./csvUploadValidation";

const MAX_CSV_COLUMNS = 256;
const MAX_CSV_HEADER_LENGTH = 255;
const MAX_CSV_RECORD_SIZE = 256 * 1024;
/*
 * Sized so every 5 MB file with values in it fits: the widest measured one
 * (ten columns, seven of them empty) is ~2.4 million cells. Three million
 * empty cells cost ~50 MB of memory to parse, measured; a 5 MB file of bare
 * commas, at over five million, is refused.
 */
const MAX_CSV_TOTAL_CELLS = 3_000_000;
/** cells × ESTIMATED_CELL_OVERHEAD_BYTES + the file itself, at MAX_CSV_TOTAL_CELLS, with headroom. */
const MAX_CSV_ESTIMATED_PARSED_BYTES = 128 * 1024 * 1024;
const ESTIMATED_CELL_OVERHEAD_BYTES = 32;

const CANDIDATE_DELIMITERS = [",", ";", "\t"] as const;

/**
 * Which character actually separates this file's columns.
 *
 * European spreadsheet exports use semicolons (comma is their decimal mark),
 * and some bank exports use tabs. csv-parse's default of comma-only made such
 * a file parse as ONE column — every row then skipped for a missing
 * description, with nothing telling the owner why. Counted on the header line
 * only: it is the one line guaranteed to contain every separator, and data
 * cells may legitimately contain the others ("Rice; Eggs").
 */
function detectDelimiter(buffer: Buffer): string {
  const head = buffer.toString("utf8", 0, Math.min(buffer.length, 64 * 1024)).replace(/^﻿/, "");
  const newlineAt = head.indexOf("\n");
  const headerLine = newlineAt === -1 ? head : head.slice(0, newlineAt);

  let best: string = ",";
  let bestColumns = 1;
  for (const delimiter of CANDIDATE_DELIMITERS) {
    const columns = headerLine.split(delimiter).length;
    // Strictly greater, so a tie keeps the earlier (comma-first) candidate —
    // ambiguity resolves toward the overwhelmingly common case.
    if (columns > bestColumns) {
      best = delimiter;
      bestColumns = columns;
    }
  }
  return best;
}

export interface ParsedCsv {
  records: Record<string, string>[];
  delimiter: string;
  headers: string[];
}

export function parseCsv(upload: Buffer): ParsedCsv {
  if (upload.byteLength > CSV_MAX_FILE_BYTES) {
    throw new ApiError(413, "This file is larger than 5 MB. Split it into smaller files and import them one at a time.", {
      code: "CSV_FILE_TOO_LARGE",
    });
  }
  // Only the parse sees the decoded text; the stored file and its hash keep the uploaded bytes.
  const buffer = decodeCsvUploadBytes(upload);

  const delimiter = detectDelimiter(buffer);
  let headers: string[] = [];
  let records: Record<string, string>[];
  let parsedCells = 0;
  let estimatedParsedBytes = 0;
  try {
    records = parse(buffer, {
      columns: (columns: string[]) => {
        if (columns.length > MAX_CSV_COLUMNS) {
          throw new ApiError(400, `CSV files can have at most ${MAX_CSV_COLUMNS} columns.`, {
            code: "CSV_HEADER_LIMIT_EXCEEDED",
          });
        }
        if (columns.some((header) => header.length > MAX_CSV_HEADER_LENGTH)) {
          throw new ApiError(400, `CSV column headers must be ${MAX_CSV_HEADER_LENGTH} characters or fewer.`, {
            code: "CSV_HEADER_LIMIT_EXCEEDED",
          });
        }
        if (columns.some((header) => !header.trim())) {
          throw new ApiError(400, "Every CSV column needs a header. Name the empty columns and try again.");
        }
        if (new Set(columns.map((header) => header.toLowerCase())).size !== columns.length) {
          throw new ApiError(400, "CSV column headers must be unique. Rename repeated columns and try again.");
        }
        headers = columns;
        return columns;
      },
      skip_empty_lines: true,
      trim: true,
      bom: true,
      delimiter,
      max_record_size: MAX_CSV_RECORD_SIZE,
      on_record: (record: Record<string, string>) => {
        const values = Object.values(record);
        parsedCells += values.length;
        for (const value of values) {
          estimatedParsedBytes += Buffer.byteLength(value, "utf8") + ESTIMATED_CELL_OVERHEAD_BYTES;
        }
        if (
          parsedCells > MAX_CSV_TOTAL_CELLS ||
          estimatedParsedBytes > MAX_CSV_ESTIMATED_PARSED_BYTES
        ) {
          throw new ApiError(413, "This CSV is too large or complex to process safely. Split it into smaller files.", {
            code: "CSV_PARSE_LIMIT_EXCEEDED",
          });
        }
        return record;
      },
    }) as Record<string, string>[];
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (
      error instanceof Error &&
      "code" in error &&
      (error as Error & { code?: unknown }).code === "CSV_MAX_RECORD_SIZE"
    ) {
      throw new ApiError(413, "A CSV row is too large to process safely. Split the file and try again.", {
        code: "CSV_PARSE_LIMIT_EXCEEDED",
      });
    }
    // Parser errors can contain raw financial cells. Neither log nor return them.
    throw new ApiError(400, "This CSV could not be read. Check its quotes and column counts, then try again.");
  }

  return { records, delimiter, headers };
}
