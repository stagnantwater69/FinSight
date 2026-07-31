import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase";
import { env } from "../config/env";
import { ApiError } from "../middleware/error.middleware";

// [ADDED] Not provisioned by the Supabase connection step (which only
// created "receipts") — CSVImportBatch.fileReference is NOT NULL in the
// data dictionary, so a real stored reference is needed, not a fake one.
const CSV_IMPORT_BUCKET = "csv-imports";

// Public, unlike receipts/csv-imports — a profile photo or business logo is
// rendered directly as an <img src>, so the URL has to work with no auth
// header attached. Neither bucket holds anything sensitive enough to need
// the signed-URL indirection the private buckets require.
const AVATAR_BUCKET = "avatars";

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

/**
 * How long a receipt image link stays valid. Long enough to open a record,
 * read the receipt and think about it; short enough that a URL copied out of
 * devtools or a shared screenshot stops working well before it could be
 * passed around. The receipts bucket is private precisely so these links are
 * the only way in.
 */
const RECEIPT_URL_TTL_SECONDS = 10 * 60;

/**
 * A temporary link to a stored receipt image.
 *
 * Returns null rather than throwing when the link can't be minted — a record
 * whose thumbnail is missing should still open and still be editable. Losing
 * the picture is a degraded page; a 500 here would be a page the owner cannot
 * use at all, over an image.
 */
export async function signedReceiptImageUrl(path: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .createSignedUrl(path, RECEIPT_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.error(`Could not sign receipt image URL for "${path}": ${error?.message ?? "no URL returned"}`);
    return null;
  }
  return data.signedUrl;
}

export async function uploadCsvFile(businessProfileId: number, buffer: Buffer, originalname: string) {
  const path = `${businessProfileId}/${randomUUID()}-${originalname}`;
  await uploadWithRetry(CSV_IMPORT_BUCKET, path, buffer, "text/csv");
  return path;
}

// `upsert: true` because a re-uploaded photo reuses the same path (see the
// callers below) — old avatars/logos are meant to be replaced, not
// accumulated forever under a new random name each time.
async function uploadPublicImage(prefix: string, buffer: Buffer, mimetype: string, originalname: string) {
  const ext = originalname.includes(".") ? originalname.split(".").pop() : mimetype.split("/")[1];
  const path = `${prefix}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from(AVATAR_BUCKET)
    .upload(path, buffer, { contentType: mimetype, upsert: true });
  if (error) {
    throw new ApiError(502, `Could not upload image to storage: ${error.message}`);
  }
  const { data } = supabaseAdmin.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  // Cache-bust: the path (and therefore the URL) is stable across re-uploads,
  // so without this the browser and CDN would keep serving the old cached
  // image after a photo change.
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function uploadUserAvatar(userId: number, buffer: Buffer, mimetype: string, originalname: string) {
  return uploadPublicImage(`users/${userId}`, buffer, mimetype, originalname);
}

export async function uploadBusinessLogo(businessProfileId: number, buffer: Buffer, mimetype: string, originalname: string) {
  return uploadPublicImage(`businesses/${businessProfileId}`, buffer, mimetype, originalname);
}
