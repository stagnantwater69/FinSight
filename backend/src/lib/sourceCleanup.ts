import { prisma } from "../config/prisma";
import { deleteCsvFile, deleteReceiptImage } from "../services/storage.service";

/**
 * Removes the uploaded file a deleted record came from, once nothing is left
 * that came from it.
 *
 * THE GAP THIS CLOSES. Deleting a record removed it from the owner's books and
 * left its receipt photograph or spreadsheet in Storage forever. Nothing ever
 * removed either, so a business's images accumulated for the life of the
 * account — and the privacy page had to say so, because "delete" that leaves
 * the picture of the receipt on a server is not the deletion an owner thinks
 * they asked for.
 *
 * WHY IT IS NOT SIMPLY "DELETE THE FILE WITH THE RECORD". One upload can
 * produce several records: an itemised receipt splits across categories, and a
 * CSV import creates a whole batch. Deleting one of those must not remove a
 * file the others still came from. So the rule is reference counting — the
 * file goes when the LAST record that came from it goes.
 *
 * Called after the record delete has already committed. Everything here is
 * best-effort by design: see removeObject in storage.service for why a failure
 * to delete a file must never turn a successful record deletion into an error.
 */

/**
 * Deletes a receipt scan and its image if no expense record still comes from
 * it.
 *
 * A PENDING SCAN IS NEVER TOUCHED, and that exclusion is the important part.
 * A scan that has not been confirmed yet has no expense records by definition
 * — it is an owner part-way through the review screen, not an orphan. Treating
 * "no records" alone as the test would delete the receipt someone is in the
 * middle of checking.
 */
export async function cleanUpReceiptScanIfOrphaned(receiptScanId: number | null | undefined) {
  if (!receiptScanId) return;

  const scan = await prisma.receiptScan.findUnique({
    where: { id: receiptScanId },
    select: { id: true, imageFile: true, confirmationStatus: true },
  });
  if (!scan || scan.confirmationStatus !== "Confirmed") return;

  const remaining = await prisma.expenseRecord.count({ where: { receiptScanId } });
  if (remaining > 0) return;

  // Items cascade from the scan row, so deleting it takes the extracted lines
  // with it. The image is a separate system and has to be asked for.
  await prisma.receiptScan.delete({ where: { id: receiptScanId } });
  await deleteReceiptImage(scan.imageFile);
}

/**
 * Deletes an import batch and its CSV if no record from it survives.
 *
 * Both record types have to be counted: one spreadsheet can produce expense
 * records, sales reference records, or both, and a batch is only spent when
 * every row it created is gone.
 */
export async function cleanUpImportBatchIfOrphaned(importBatchId: number | null | undefined) {
  if (!importBatchId) return;

  const batch = await prisma.cSVImportBatch.findUnique({
    where: { id: importBatchId },
    select: { id: true, fileReference: true },
  });
  if (!batch) return;

  const [expenses, sales] = await Promise.all([
    prisma.expenseRecord.count({ where: { importBatchId } }),
    prisma.salesReferenceRecord.count({ where: { importBatchId } }),
  ]);
  if (expenses > 0 || sales > 0) return;

  await prisma.cSVImportBatch.delete({ where: { id: importBatchId } });
  await deleteCsvFile(batch.fileReference);
}
