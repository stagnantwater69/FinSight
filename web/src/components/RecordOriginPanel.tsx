import { useState, type ReactNode } from "react";
import { Money } from "./Money";
import type { RecordOrigin } from "../lib/types";

/**
 * Where a saved record came from.
 *
 * WHY THIS EXISTS: a record created by a receipt scan is a SUMMARY. "Inventory
 * — PHP 1,850" was really buns, patties and a tray of eggs, read off a photo,
 * filed alongside an Equipment record from the same receipt. Opening it to
 * edit and seeing only the summary left the owner with no way to check the
 * figure against reality, no reminder of what the purchase actually was, and
 * no clue that half the receipt was sitting in another record entirely.
 *
 * Everything here is read-only on purpose. Editing an item would mean
 * recomputing the split across sibling records — a much larger change, and one
 * with its own reconciliation problem. This panel answers "what is this?", and
 * the form below it still answers "what should it be?".
 */
export function RecordOriginPanel({
  origin,
  recordAmount,
}: {
  origin: RecordOrigin;
  recordAmount: number;
}) {
  if (origin.kind === "csv_import") {
    return (
      <section className="rounded-2xl border border-paper-200 bg-paper-50 p-4">
        <h2 className="text-sm font-semibold text-ink-800">From a CSV import</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">
          {/*
            A spreadsheet row IS the record — there are no line items behind
            it. So the useful provenance is the batch: which file this came in
            on, and what else came with it.
          */}
          This record was one row in an imported file. A CSV row has no item
          breakdown behind it — what you see below is the whole record.
        </p>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
          <Detail label="Import" value={origin.title} />
          <Detail label="Uploaded" value={new Date(origin.uploadDate).toLocaleDateString()} />
          <Detail label="Status" value={origin.status} />
          <Detail
            label="Rows in this import"
            value={`${origin.rowCount} record${origin.rowCount === 1 ? "" : "s"}`}
          />
          <div className="sm:col-span-2">
            <dt className="font-medium text-ink-600">File</dt>
            <dd className="mt-0.5 break-all text-ink-800">{origin.fileReference}</dd>
          </div>
        </dl>
      </section>
    );
  }

  const chargesCentavos =
    Math.round(recordAmount * 100) - Math.round(origin.itemsSubtotal * 100);

  return (
    <section className="rounded-2xl border border-paper-200 bg-paper-50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink-800">From a scanned receipt</h2>
        <p className="text-xs text-ink-500">
          Scanned {new Date(origin.scannedAt).toLocaleDateString()}
          {origin.extractedVendor ? ` · ${origin.extractedVendor}` : ""}
        </p>
      </div>

      {origin.items.length > 0 ? (
        <>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            The {origin.items.length} line{origin.items.length === 1 ? "" : "s"} that make up this record.
          </p>

          <div className="mt-2.5 overflow-x-auto rounded-xl border border-paper-200 bg-paper">
            <table className="w-full min-w-[26rem] text-left text-sm">
              <caption className="sr-only">Items from the receipt that make up this record</caption>
              <thead>
                <tr className="border-b border-paper-200 bg-paper-100">
                  <Th>Item</Th>
                  <Th align="right">Qty</Th>
                  <Th align="right">Unit</Th>
                  <Th align="right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {origin.items.map((item) => (
                  <tr key={item.id} className="border-t border-paper-200">
                    <td className="px-3 py-2 text-ink-800">
                      {item.name}
                      {/*
                        A line the owner typed in is not something FinSight
                        read off the receipt, and this panel must not let the
                        heading above imply otherwise.
                      */}
                      {item.addedByOwner ? (
                        <span className="ml-1.5 rounded-full bg-paper-200 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">
                          you added
                        </span>
                      ) : null}
                      {/*
                        Nor did FinSight read this one off the receipt's text —
                        OCR found none, so AI interpreted the photograph. The
                        same reasoning as the badge above: the heading claims a
                        reading, and a line that was inferred must say so.
                      */}
                      {item.extractedByVision ? (
                        <span className="ml-1.5 rounded-full bg-tint-accent px-1.5 py-0.5 text-[10px] font-medium text-tone-accent">
                          AI read from photo
                        </span>
                      ) : null}
                    </td>
                    <td className="figure px-3 py-2 text-right text-ink-600">{item.quantity ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-ink-600">
                      {item.unitPrice === null ? "—" : <Money value={item.unitPrice} decimals bare />}
                    </td>
                    <td className="px-3 py-2 text-right text-ink-900">
                      <Money value={item.amount} decimals bare />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-paper-200 bg-paper-100">
                  <td colSpan={3} className="px-3 py-2 text-xs font-medium text-ink-600">
                    Items subtotal
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-medium text-ink-900">
                    <Money value={origin.itemsSubtotal} decimals bare />
                  </td>
                </tr>
                {/*
                  The arithmetic, shown rather than hidden.

                  A receipt's items routinely do not sum to what was paid — a
                  VAT-exclusive register adds tax on top, a discount takes some
                  off. That share is part of this record's amount, and showing
                  the record's total without it would make the items look like
                  they simply don't add up.
                */}
                {chargesCentavos !== 0 ? (
                  <tr className="bg-paper-100">
                    <td colSpan={3} className="px-3 py-2 text-xs font-medium text-ink-600">
                      {chargesCentavos > 0 ? "Share of tax and charges" : "Share of discount"}
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-ink-700">
                      <Money value={chargesCentavos / 100} decimals bare signed />
                    </td>
                  </tr>
                ) : null}
                <tr className="border-t border-paper-200 bg-paper-100">
                  <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-ink-700">
                    This record
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-semibold text-ink-900">
                    <Money value={recordAmount} decimals bare />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : (
        <p className="mt-1 text-xs leading-relaxed text-ink-500">
          FinSight couldn't read individual items off this receipt, so it was saved as a single total.
        </p>
      )}

      {/*
        The other half of the receipt.

        Without this, an owner looking at the Inventory record from a
        mixed receipt has no way to tell that the equipment they remember
        buying is filed separately rather than missing entirely.
      */}
      {origin.siblings.length > 0 ? (
        <div className="mt-3 rounded-xl bg-paper-100 p-3">
          <p className="text-xs font-semibold text-ink-600">
            This receipt was also split into {origin.siblings.length} other record
            {origin.siblings.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-1.5 space-y-1">
            {origin.siblings.map((sibling) => (
              <li key={sibling.id} className="flex items-baseline justify-between gap-3 text-sm">
                <a
                  href={`/records/expenses/${sibling.id}/edit`}
                  className="min-w-0 truncate text-brand-700 underline-offset-2 hover:underline"
                >
                  {sibling.categoryName}
                  <span className="ml-1.5 text-xs text-ink-400">{sibling.description}</span>
                </a>
                <span className="shrink-0 text-ink-800">
                  <Money value={sibling.amount} decimals />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {origin.imageUrl ? <ReceiptImage url={origin.imageUrl} /> : null}
    </section>
  );
}

/**
 * The receipt photo, collapsed by default.
 *
 * Open by default would push the form itself below the fold on a phone, and
 * the common reason to open a record is to change a field rather than to
 * re-read the picture.
 */
function ReceiptImage({ url }: { url: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="tap-inline text-xs font-medium text-brand-700 transition hover:text-brand-800"
      >
        {open ? "Hide the receipt photo" : "Show the receipt photo"}
      </button>
      {open ? (
        <img
          src={url}
          alt="The scanned receipt this record came from"
          className="mt-2 w-full rounded-xl border border-paper-200 object-contain"
        />
      ) : null}
    </div>
  );
}

function Th({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-[0.06em] text-ink-500 ${
        align === "right" ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-ink-600">{label}</dt>
      <dd className="mt-0.5 text-ink-800">{value}</dd>
    </div>
  );
}
