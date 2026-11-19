import { api } from "./api";

/**
 * Downloads the records matching `query` from /records/export (same filters as
 * /records/search), writes them to the cache folder and opens the share sheet
 * so the owner can send the file to their accountant or save it.
 *
 * The native modules are loaded on use, like receiptScannerCache, so the
 * records screen does not pull them in just by rendering.
 */
export async function exportRecordsCsv(query: Record<string, string | number | boolean | undefined>, name?: string): Promise<void> {
  const text = await api.getText("/records/export", query);
  const [{ File, Paths }, Sharing] = await Promise.all([import("expo-file-system"), import("expo-sharing")]);
  // fetch's text() drops the BOM the server sent; Excel needs it to read ₱ and ñ as UTF-8.
  const csv = text.startsWith("\uFEFF") ? text : `\uFEFF${text}`;
  const range = [query.dateFrom, query.dateTo].filter(Boolean).join("-to-");
  const kind = query.type && query.type !== "all" ? String(query.type) : "records";
  const file = new File(Paths.cache, `${name ?? `finsight-${kind}${range ? `-${range}` : ""}`}.csv`);
  file.create({ overwrite: true });
  await file.write(csv);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing isn't available on this device.");
  }
  await Sharing.shareAsync(file.uri, { mimeType: "text/csv", UTI: "public.comma-separated-values-text", dialogTitle: "Export CSV" });
}
