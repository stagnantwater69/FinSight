import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase";
import { env } from "../config/env";
import { ApiError } from "../middleware/error.middleware";

// [ADDED] Not provisioned by the Supabase connection step (which only
// created "receipts") — CSVImportBatch.fileReference is NOT NULL in the
// data dictionary, so a real stored reference is needed, not a fake one.
const CSV_IMPORT_BUCKET = "csv-imports";

// One retry, for genuinely transient Storage failures (network blips, 5xx).
//
// HISTORICAL NOTE: this retry was originally added to paper over a
// "mysterious intermittent RLS 403 under concurrent load". That diagnosis
// was wrong. The real cause was that auth.service called
// signInWithPassword on the shared supabaseAdmin client, which left the
// signed-in user's `authenticated`-role session on it, so every later
// upload authenticated as that user instead of as service_role. It only
// looked intermittent because it depended on whether a login had happened
// in the process yet — and no number of retries could ever fix it, since
// the client stayed contaminated until restart. Fixed at the source in
// config/supabase.ts (createPasswordAuthClient). The retry stays because
// it's still reasonable for real transients, but it is no longer load-
// bearing: an RLS 403 here now means something is genuinely misconfigured
// and should be investigated, not retried away.
async function uploadWithRetry(bucket: string, path: string, buffer: Buffer, contentType: string) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { error } = await supabaseAdmin.storage.from(bucket).upload(path, buffer, { contentType });
    if (!error) return;

    const status = (error as { status?: number }).status;
    const statusCode = (error as { statusCode?: string }).statusCode;
    console.error(`Storage upload failed (attempt ${attempt}/2): ${error.message} [status=${status} statusCode=${statusCode}]`);

    if (attempt === 2) {
      throw new ApiError(502, `Could not upload file to storage: ${error.message}`);
    }
  }
}

export async function uploadReceiptImage(businessProfileId: number, buffer: Buffer, mimetype: string, originalname: string) {
  const ext = originalname.includes(".") ? originalname.split(".").pop() : mimetype.split("/")[1];
  const path = `${businessProfileId}/${randomUUID()}.${ext}`;
  await uploadWithRetry(env.SUPABASE_STORAGE_BUCKET, path, buffer, mimetype);
  return path;
}

export async function uploadCsvFile(businessProfileId: number, buffer: Buffer, originalname: string) {
  const path = `${businessProfileId}/${randomUUID()}-${originalname}`;
  await uploadWithRetry(CSV_IMPORT_BUCKET, path, buffer, "text/csv");
  return path;
}
