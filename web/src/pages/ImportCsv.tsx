import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { Callout, Card, FormPage, PageHead } from "../components/ui";
import { Button, ButtonLink } from "../components/Button";
import { Celebration } from "../components/Confirmation";
import { Field, FileInput, FormError, SelectInput, TextInput } from "../components/Field";
import { Money } from "../components/Money";

interface PreviewResult {
  headers: string[];
  previewRows: Record<string, string>[];
  totalRows: number;
}

interface ImportResult {
  batchId: number;
  title: string;
  status: string;
  totalRows: number;
  imported: number;
  skipped: { row: number; reason: string }[];
  flagged: number;
  largeExpenseFlagged: number;
}

/**
 * Header synonyms, for guessing the column mapping.
 *
 * Owners export from Excel, Google Sheets, a POS app or a bookkeeper's
 * template, and the headings are mostly the obvious English words. Making
 * someone map four dropdowns by hand when their file literally says
 * "date,description,amount,category" is the kind of friction UAT item 32
 * measures ("could record a day quickly enough to do it regularly").
 *
 * The guess is a starting point, never a decision: every field stays editable
 * and says that it was matched automatically.
 */
const HEADER_SYNONYMS: Record<"date" | "description" | "amount" | "category" | "vendor", string[]> = {
  date: ["date", "txn date", "transaction date", "trans date", "posted", "day", "petsa"],
  description: ["description", "item", "particulars", "details", "detail", "memo", "notes", "note"],
  amount: ["amount", "total", "price", "cost", "value", "debit", "halaga"],
  category: ["category", "type", "class", "account", "group", "uri"],
  vendor: ["vendor", "supplier", "store", "shop", "merchant", "payee", "seller", "from", "tindahan"],
};

/**
 * The server's row rules, mirrored so a bad row can be shown and fixed
 * BEFORE the import runs rather than reported after it.
 *
 * This is a deliberate second copy of csvImport.service's validateRows, for
 * the same reason the receipt split editor re-checks its own arithmetic: the
 * server is still the authority and re-runs every one of these checks on the
 * corrected value, so the worst a drift here can do is show the owner a
 * problem that turns out not to be one (or miss one, which the server then
 * reports exactly as it does today). It can never let a bad row through.
 * The checks and their order — description, then date, then amount, then
 * category — match the server's so the reported reason is the same one.
 */
export type RowProblem = { field: MappedField; reason: string } | null;

function problemWith(values: Record<MappedField, string>, needsCategory: boolean): RowProblem {
  if (!values.Description.trim()) return { field: "Description", reason: "Missing description" };

  const rawDate = values.Date.trim();
  const parsed = rawDate ? new Date(rawDate) : null;
  if (!rawDate || !parsed || Number.isNaN(parsed.getTime())) {
    return { field: "Date", reason: `Invalid date: "${rawDate}"` };
  }

  const rawAmount = values.Amount.trim();
  const amount = rawAmount ? Number(rawAmount.replace(/,/g, "")) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { field: "Amount", reason: `Invalid amount: "${rawAmount}"` };
  }

  if (needsCategory && !values.Category.trim()) {
    return { field: "Category", reason: "Missing category" };
  }
  return null;
}

function normalise(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/** Exact synonym match first, then a contains match, so "Txn Date (PHP)" lands. */
function guessColumn(headers: string[], field: keyof typeof HEADER_SYNONYMS): string {
  const synonyms = HEADER_SYNONYMS[field];
  const exact = headers.find((h) => synonyms.includes(normalise(h)));
  if (exact) return exact;
  return headers.find((h) => synonyms.some((s) => normalise(h).includes(s))) ?? "";
}

export function ImportCsv() {
  const { selected } = useBusinessProfiles();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [recordType, setRecordType] = useState<"expense" | "sales">("expense");
  const [title, setTitle] = useState("");
  const [dateCol, setDateCol] = useState("");
  const [descriptionCol, setDescriptionCol] = useState("");
  const [amountCol, setAmountCol] = useState("");
  const [categoryCol, setCategoryCol] = useState("");
  const [vendorCol, setVendorCol] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  /** Which fields were guessed rather than chosen, so each can say so. */
  const [autoMapped, setAutoMapped] = useState<Set<string>>(new Set());
  /**
   * Cells the owner has retyped, keyed by spreadsheet row number then field.
   * Sent to the server as `corrections` and applied there over the file.
   */
  const [corrections, setCorrections] = useState<Record<number, Partial<Record<MappedField, string>>>>({});

  if (!selected) return null;

  /**
   * One CSV column mapped to two FinSight fields is always a mistake — it would
   * import the description as the amount, or the date as the category — and
   * nothing stopped it before.
   */
  const requiredMapping: [string, string][] = [
    ["date", dateCol],
    ["description", descriptionCol],
    ["amount", amountCol],
    ...(recordType === "expense" ? ([["category", categoryCol]] as [string, string][]) : []),
  ];

  // Vendor is checked for collisions but not for completeness: it is optional
  // (ExpenseRecord.vendor is nullable), so leaving it unmapped is a valid
  // choice, while pointing it at a column another field already owns is not.
  const allMapping: [string, string][] =
    recordType === "expense" ? [...requiredMapping, ["vendor", vendorCol]] : requiredMapping;

  const duplicateColumns = new Set(
    allMapping
      .map(([, col]) => col)
      .filter((col, i, all) => col !== "" && all.indexOf(col) !== i),
  );

  const mappingIsComplete = requiredMapping.every(([, col]) => col !== "");
  const mappingIsValid = mappingIsComplete && duplicateColumns.size === 0;

  function duplicateError(col: string): string | null {
    return col !== "" && duplicateColumns.has(col)
      ? `"${col}" is already mapped to another field. Each FinSight field needs its own column.`
      : null;
  }

  /** Once the owner picks a column themselves, it is no longer a guess. */
  function clearAuto(field: string) {
    setAutoMapped((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }


  async function handlePreview(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setPreviewing(true);
    setPreviewError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post<PreviewResult>("/records/csv-imports/preview", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreview(data);
      setTitle(file.name.replace(/\.csv$/i, ""));

      // Guess the mapping from the headings. Anything not recognised stays
      // empty and the owner picks it, which is the behaviour that existed for
      // all four columns before.
      const guessed = {
        date: guessColumn(data.headers, "date"),
        description: guessColumn(data.headers, "description"),
        amount: guessColumn(data.headers, "amount"),
        category: guessColumn(data.headers, "category"),
        vendor: guessColumn(data.headers, "vendor"),
      };
      setDateCol(guessed.date);
      setDescriptionCol(guessed.description);
      setAmountCol(guessed.amount);
      setCategoryCol(guessed.category);
      setVendorCol(guessed.vendor);
      setAutoMapped(
        new Set(
          (Object.keys(guessed) as (keyof typeof guessed)[]).filter((k) => guessed[k] !== ""),
        ),
      );
    } catch (err) {
      setPreviewError(getErrorMessage(err));
    } finally {
      setPreviewing(false);
    }
  }

  /**
   * Back to the file picker, clearing the mapping with it.
   *
   * The mapping used to survive into the next file, whose headers may not
   * contain any of those column names — leaving the selects showing a blank
   * value that looked like a choice the owner had made.
   */
  function handleChooseDifferentFile() {
    setPreview(null);
    setFile(null);
    setTitle("");
    setDateCol("");
    setDescriptionCol("");
    setAmountCol("");
    setCategoryCol("");
    setVendorCol("");
    setAutoMapped(new Set());
    setCorrections({});
    setConfirmError(null);
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault();
    if (!file || !mappingIsValid) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("businessProfileId", String(selected!.id));
      formData.append("recordType", recordType);
      formData.append("title", title);
      formData.append(
        "columnMapping",
        JSON.stringify({
          date: dateCol,
          description: descriptionCol,
          amount: amountCol,
          ...(recordType === "expense" ? { category: categoryCol } : {}),
          // Omitted entirely when unmapped — the server's schema takes vendor
          // as optional, not as an empty string.
          ...(recordType === "expense" && vendorCol ? { vendor: vendorCol } : {}),
        }),
      );
      if (Object.keys(corrections).length > 0) {
        // Lower-cased keys, because the server names its fields the way the
        // columnMapping does rather than the way the table headings read.
        formData.append(
          "corrections",
          JSON.stringify(
            Object.fromEntries(
              Object.entries(corrections).map(([rowNumber, fields]) => [
                rowNumber,
                Object.fromEntries(Object.entries(fields).map(([k, v]) => [k.toLowerCase(), v])),
              ]),
            ),
          ),
        );
      }
      const { data } = await api.post<ImportResult>("/records/csv-imports/confirm", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
    } catch (err) {
      setConfirmError(getErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  }

  if (result) {
    const flaggedTotal = result.flagged + (result.largeExpenseFlagged ?? 0);
    const clean = result.skipped.length === 0 && flaggedTotal === 0;

    return (
      <FormPage eyebrow="Records" title="Import complete">
        {/*
          Confirmation.tsx names CSV import as one of the three moments that
          earns a designed ending — a lot of work landing at once — and it was
          the one that never got it. A clean import is a genuine payoff; an
          import with rows to review is not, so that case keeps the calm
          summary instead of being congratulated.
        */}
        {clean ? (
          <Celebration title={`${result.imported} record${result.imported === 1 ? "" : "s"} imported`}>
            Every row in <strong className="text-ink-800">{result.title}</strong> went in cleanly — nothing
            was skipped and nothing needs review.
          </Celebration>
        ) : null}

        <dl className={`space-y-2 text-sm ${clean ? "mt-6" : ""}`}>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Rows in file</dt>
            <dd className="figure font-medium text-ink-900">{result.totalRows}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Imported</dt>
            <dd className="figure font-medium text-ink-900">{result.imported}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Skipped</dt>
            <dd className="figure font-medium text-ink-900">{result.skipped.length}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Flagged as possible duplicates</dt>
            <dd className="figure font-medium text-ink-900">{result.flagged}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-500">Flagged as large expenses</dt>
            <dd className="figure font-medium text-ink-900">{result.largeExpenseFlagged ?? 0}</dd>
          </div>
        </dl>

        {/*
          The flag counts used to be dead numbers. A count of things needing
          review, with no way to reach them, is worse than no count — it tells
          the owner there is a problem and then leaves them to find it.
        */}
        {flaggedTotal > 0 ? (
          <div className="mt-4">
            <Callout tone="warn">
              <b className="font-semibold">
                {flaggedTotal} record{flaggedTotal === 1 ? "" : "s"} need a second look.
              </b>{" "}
              FinSight flags a record when it matches one you already have, or when it's large for your
              business.{" "}
              <Link
                to="/records/flagged"
                className="tap-inline font-semibold text-tone-accent underline underline-offset-2"
              >
                Review them now →
              </Link>
            </Callout>
          </div>
        ) : null}

        {result.skipped.length > 0 ? (
          <div className="mt-4 rounded-lg bg-tint-danger p-3 text-xs text-tone-danger ring-1 ring-edge-danger">
            <p className="mb-1 font-medium">
              These rows couldn't be read and were not imported. Fix them in your spreadsheet and import
              again:
            </p>
            <ul className="list-inside list-disc space-y-0.5">
              {result.skipped.map((s) => (
                <li key={s.row}>
                  Row {s.row}: {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink to="/records" variant={clean ? "primary" : "brand"}>
            See your records
          </ButtonLink>
          <ButtonLink to="/records/csv-imports/new" variant="secondary">
            Import another file
          </ButtonLink>
        </div>
      </FormPage>
    );
  }

  // ---- stage 1: choose a file -------------------------------------------
  if (!preview) {
    return (
      <FormPage
        eyebrow="Records"
        title="Import CSV records"
        subtitle="Bring in a batch of expenses or sales from a spreadsheet export."
      >
        <form onSubmit={handlePreview} className="space-y-4">
          <Field label="CSV file" htmlFor="file" required>
            <FileInput
              accept=".csv,text/csv"
              maxBytes={5 * 1024 * 1024}
              file={file}
              onSelect={setFile}
              hintText="A .csv export from your spreadsheet, up to 5MB. The first row should be your column headings."
            />
          </Field>
          {previewError ? <FormError>{previewError}</FormError> : null}
          <Button type="submit" variant="primary" fullWidth disabled={previewing || !file}>
            {previewing ? "Reading file…" : "Preview"}
          </Button>
        </form>
      </FormPage>
    );
  }

  // ---- stage 2: map the columns and check the result ---------------------
  //
  // Deliberately NOT inside FormPage, for the reason ScanReceipt's confirm
  // screen isn't either: FormPage's single form-measure column (max-w-3xl)
  // exists to keep label/field pairs scannable, and it is exactly the wrong
  // container for a wide data table. The table is the primary object on this
  // screen, so the screen is built around the table instead.
  const columns: MappedColumn[] = [
    {
      field: "Date",
      value: dateCol,
      onChange: (v) => {
        setDateCol(v);
        clearAuto("date");
      },
      auto: autoMapped.has("date"),
    },
    {
      field: "Description",
      value: descriptionCol,
      onChange: (v) => {
        setDescriptionCol(v);
        clearAuto("description");
      },
      auto: autoMapped.has("description"),
    },
    ...(recordType === "expense"
      ? [
          {
            field: "Category" as const,
            value: categoryCol,
            onChange: (v: string) => {
              setCategoryCol(v);
              clearAuto("category");
            },
            auto: autoMapped.has("category"),
          },
          {
            field: "Vendor" as const,
            value: vendorCol,
            onChange: (v: string) => {
              setVendorCol(v);
              clearAuto("vendor");
            },
            auto: autoMapped.has("vendor"),
            optional: true,
          },
        ]
      : []),
    {
      field: "Amount",
      value: amountCol,
      onChange: (v) => {
        setAmountCol(v);
        clearAuto("amount");
      },
      auto: autoMapped.has("amount"),
      align: "right" as const,
    },
  ];

  /**
   * Every previewed row, read through the mapping and through any correction
   * the owner has typed, with the first thing wrong with it (if anything).
   *
   * Row numbers are the spreadsheet's own — header is row 1 — so the number
   * shown here is the number to look for in Excel, and is the same key the
   * server reports skips against.
   */
  const analysed = preview.previewRows.map((row, i) => {
    const rowNumber = i + 2;
    const values = Object.fromEntries(
      columns.map((c) => [c.field, corrections[rowNumber]?.[c.field] ?? (c.value ? (row[c.value] ?? "") : "")]),
    ) as Record<MappedField, string>;
    return { rowNumber, values, problem: problemWith(values, recordType === "expense") };
  });
  const brokenRows = mappingIsValid ? analysed.filter((r) => r.problem !== null) : [];
  const fixedCount = Object.keys(corrections).length;

  function correct(rowNumber: number, field: MappedField, value: string) {
    setCorrections((prev) => ({ ...prev, [rowNumber]: { ...prev[rowNumber], [field]: value } }));
  }

  return (
    <div>
      <PageHead
        eyebrow="Records"
        title="Map your columns"
        subtitle="Each heading below picks which column of your file feeds it. The rows underneath are your real data, read through those choices — what you see is what gets imported."
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={handleChooseDifferentFile}>
            Choose a different file
          </Button>
        }
      />

      <form onSubmit={handleConfirm} className="space-y-4">
        <Card className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Import as" htmlFor="csv-record-type" required>
              <SelectInput
                value={recordType}
                onChange={(e) => setRecordType(e.target.value as "expense" | "sales")}
              >
                <option value="expense">Expense records</option>
                <option value="sales">Sales reference records</option>
              </SelectInput>
            </Field>
            <Field
              label="Batch title"
              htmlFor="csv-title"
              required
              hint="What to call this import in your records, so you can find it again."
            >
              <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required />
            </Field>
          </div>
        </Card>

        {/*
          The mapping lives in the table header rather than in four selects
          stacked above it.

          It used to be both: four full-height <Field> rows saying "Date ←
          txn_date", and then a preview immediately below re-stating the same
          four mappings as its column headings. The owner scrolled past ~400px
          of controls — usually all four already correct, since the header
          guess in HEADER_SYNONYMS lands on most real exports — to reach the
          data they actually wanted to look at.

          Merging the two puts each choice against the values it governs, so a
          wrong guess is visible rather than inferred, and gives the table the
          vertical space that the duplicated controls were using. The submitted
          columnMapping is byte-for-byte what it was.
        */}
        {/*
          A capped height, deliberately, rather than letting the table run the
          full length of the page.

          `overflow-x: auto` is needed so a narrow screen scrolls the table
          instead of the document, and that computes `overflow-y` to `auto`
          too — which makes this div a scroll container whether or not it is
          told a height. Without a max-height it is a scroll container that can
          never scroll, and `sticky` on the headers then resolves against it and
          silently does nothing: scroll the page on a 50-row file and the
          mapping controls leave the screen with no way back. Capping it makes
          the sticky header real, so the pickers stay pinned above the data
          they govern for the whole scroll.
        */}
        <div className="max-h-[70vh] overflow-auto rounded-2xl border border-paper-200 bg-paper shadow-sm">
          <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
            <caption className="sr-only">
              Your CSV data, shown through the current column mapping
            </caption>
            <thead>
              <tr>
                {/* A row-number gutter, so "Row 3" in the panel below is
                    something the owner can actually find up here — and the
                    same number their spreadsheet uses. */}
                <th
                  scope="col"
                  className="sticky top-0 z-10 w-12 border-b border-paper-200 bg-paper-100/95 px-3 py-2.5 align-top text-right backdrop-blur"
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-400">#</span>
                </th>
                {columns.map((c) => (
                  <MappedHeader
                    key={c.field}
                    column={c}
                    headers={preview.headers}
                    error={duplicateError(c.value)}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {analysed.map(({ rowNumber, values, problem }) => (
                <tr
                  key={rowNumber}
                  // A row that won't import is marked here too, so the count in
                  // the panel below corresponds to something visible in the data
                  // rather than being a number the owner has to take on trust.
                  className={`border-t border-paper-200 ${
                    problem ? "bg-tint-danger/40" : "even:bg-paper-100/40"
                  }`}
                >
                  <td className="figure px-3 py-2 text-right text-xs text-ink-400">{rowNumber}</td>
                  {columns.map((c) => (
                    <td
                      key={c.field}
                      className={`px-3 py-2 align-top text-ink-700 ${
                        c.align === "right" ? "text-right" : ""
                      } ${c.field === "Description" ? "" : "whitespace-nowrap"}`}
                    >
                      <CellValue value={values[c.field]} column={c} isProblem={problem?.field === c.field} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-ink-500">
          Showing {preview.previewRows.length} of {preview.totalRows} row
          {preview.totalRows === 1 ? "" : "s"}.{" "}
          {brokenRows.length === 0
            ? `All ${preview.totalRows} will be imported.`
            : `${brokenRows.length} of them won't import as ${brokenRows.length === 1 ? "it is" : "they are"} — see below.`}
        </p>

        {/*
          Rows that won't import, put in front of the owner while the import
          can still include them.

          The skip report already existed, but only afterwards, and it said
          "Fix them in your spreadsheet and import again" — reopen Excel, find
          the row, retype the cell, re-upload, re-map. For a file where three
          dates are formatted oddly that is the whole import done twice. The
          same three cells are editable here, and the fixes ride along with
          the import as corrections applied over the file.
        */}
        {brokenRows.length > 0 ? (
          <Card className="border-edge-accent p-5">
            <h2 className="text-sm font-semibold text-ink-900">
              {brokenRows.length} row{brokenRows.length === 1 ? "" : "s"} won't import as{" "}
              {brokenRows.length === 1 ? "it is" : "they are"}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              Fix the highlighted cell to bring the row in, or leave it and it will be skipped — the
              rest of the file imports either way. Nothing here changes your original file.
            </p>

            <ul className="mt-3 space-y-2">
              {brokenRows.map(({ rowNumber, values, problem }) => (
                <li key={rowNumber} className="rounded-xl bg-paper-100 p-3">
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className="figure text-xs font-semibold text-ink-600">Row {rowNumber}</span>
                    <p
                      id={`fix-${rowNumber}-${problem!.field}-why`}
                      className="text-xs text-tone-danger"
                    >
                      {problem!.reason}
                    </p>
                  </div>
                  {/*
                    The broken cell gets the full width and the keyboard; the
                    rest are read-only context so the owner can recognise the
                    row without going back to the spreadsheet. Grid rather than
                    a nowrap flex row — at five columns the row no longer fits
                    on one line at any sensible field width.
                  */}
                  <div className="grid gap-x-3 gap-y-2 sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">
                    {columns.map((c) => {
                      const isProblem = problem!.field === c.field;
                      const id = `fix-${rowNumber}-${c.field}`;
                      return (
                        <div key={c.field} className={`min-w-0 ${isProblem ? "sm:col-span-2" : ""}`}>
                          <label htmlFor={id} className="block text-[11px] font-medium text-ink-500">
                            {c.field}
                          </label>
                          {isProblem ? (
                            <TextInput
                              id={id}
                              value={values[c.field]}
                              onChange={(e) => correct(rowNumber, c.field, e.target.value)}
                              aria-describedby={`${id}-why`}
                              aria-invalid
                              className="!border-edge-danger"
                            />
                          ) : (
                            <p className="truncate pt-1.5 text-sm text-ink-600" title={values[c.field]}>
                              {values[c.field] || "—"}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : fixedCount > 0 ? (
          <Callout tone="brand">
            Every row is ready to import now.
          </Callout>
        ) : null}

        {confirmError ? <FormError>{confirmError}</FormError> : null}
        <div className="flex flex-wrap gap-3">
          {/*
            The count promises what will actually land. Saying "Import 35 rows"
            over a file where three of them are going to be skipped is a small
            lie the owner only discovers on the results screen — and the
            preview is capped, so it is only a reliable count when the whole
            file is on screen.
          */}
          <Button type="submit" variant="primary" disabled={confirming || !mappingIsValid}>
            {confirming
              ? "Importing…"
              : brokenRows.length > 0 && preview.previewRows.length === preview.totalRows
                ? `Import ${preview.totalRows - brokenRows.length} of ${preview.totalRows} rows`
                : `Import ${preview.totalRows} row${preview.totalRows === 1 ? "" : "s"}`}
          </Button>
          <Button type="button" variant="secondary" onClick={handleChooseDifferentFile}>
            Choose a different file
          </Button>
        </div>
      </form>
    </div>
  );
}

/** FinSight's own field names — the things a CSV column can become. */
export type MappedField = "Date" | "Description" | "Category" | "Vendor" | "Amount";

interface MappedColumn {
  /** FinSight's own field name — the thing this column becomes on import. */
  field: MappedField;
  /** The CSV header currently feeding it, or "" when unmapped. */
  value: string;
  onChange: (v: string) => void;
  /** True while this is still FinSight's guess rather than the owner's choice. */
  auto: boolean;
  align?: "right";
  /** Leaving it unmapped is a valid choice — currently Vendor alone. */
  optional?: boolean;
}

/**
 * Per-column widths.
 *
 * Left to itself the table gives five equal columns, which is wrong in both
 * directions at once: a date needs about nine characters and a description
 * routinely runs past forty, so the dates sit in a sea of whitespace while the
 * descriptions wrap. These are the shape of the data, not the header.
 */
const COLUMN_WIDTH: Record<MappedField, string> = {
  Date: "w-[9.5rem]",
  Description: "w-auto",
  Category: "w-[11rem]",
  Vendor: "w-[11rem]",
  Amount: "w-[9.5rem]",
};

/**
 * A column heading that is also its own column picker.
 *
 * `scope="col"` and the visible field name are kept so the header still does
 * its ordinary table job for a screen reader; the select carries an explicit
 * aria-label because "Date" alone doesn't say what choosing something here
 * would do.
 */
function MappedHeader({
  column,
  headers,
  error,
}: {
  column: MappedColumn;
  headers: string[];
  error: string | null;
}) {
  const id = `csv-map-${column.field.toLowerCase()}`;
  return (
    <th
      scope="col"
      className={`sticky top-0 z-10 border-b border-paper-200 bg-paper-100/95 px-3 py-2.5 align-top backdrop-blur ${COLUMN_WIDTH[column.field]}`}
    >
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-[0.06em] text-ink-500">
        {column.field}
        {column.optional ? (
          <span className="ml-1 font-normal normal-case tracking-normal text-ink-400">(optional)</span>
        ) : (
          <span className="ml-1 text-tone-danger" title="Required">
            <span aria-hidden>*</span>
            <span className="sr-only">(required)</span>
          </span>
        )}
      </label>
      <SelectInput
        id={id}
        required={!column.optional}
        value={column.value}
        onChange={(e) => column.onChange(e.target.value)}
        aria-label={`Which CSV column holds the ${column.field.toLowerCase()}?`}
        aria-invalid={error ? true : undefined}
        className={`mt-1.5 ${error ? "border-edge-danger" : ""}`}
      >
        {/* An optional field has to be un-choosable again, or a stray guess
            could never be undone. The required ones keep a disabled prompt. */}
        <option value="" disabled={!column.optional}>
          {column.optional ? "Don't import this" : "Select a column"}
        </option>
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </SelectInput>
      {error ? (
        <p role="alert" className="mt-1.5 flex items-start gap-1 text-[11px] font-normal normal-case tracking-normal text-tone-danger">
          <span aria-hidden>⚠</span>
          <span className="min-w-0">{error}</span>
        </p>
      ) : column.auto ? (
        // Shortened to two words. At four columns the full sentence was a
        // useful nudge; at five it is the same forty characters repeated five
        // times across the widest element on the page, which reads as noise
        // and pushes the data further down. The title carries the long form.
        <p
          className="mt-1.5 text-[11px] font-normal normal-case tracking-normal text-ink-400"
          title="FinSight matched this column automatically — change it if that's wrong."
        >
          ✦ Auto-matched
        </p>
      ) : (
        // Holds the row height steady so the header doesn't jump as hints
        // appear and disappear while the owner works through the columns.
        <p aria-hidden className="mt-1.5 text-[11px] text-transparent">
          &nbsp;
        </p>
      )}
    </th>
  );
}

/**
 * One preview cell.
 *
 * An unmapped column shows a placeholder rather than blanking the whole table:
 * the previous version hid the preview entirely until all four selects were
 * filled, which meant the data an owner needed in order to CHOOSE a mapping
 * only appeared once they had finished choosing it.
 */
function CellValue({
  value,
  column,
  isProblem,
}: {
  value: string;
  column: MappedColumn;
  isProblem?: boolean;
}) {
  if (column.value === "") {
    return <span className="text-ink-400">—</span>;
  }

  if (column.field === "Amount") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) && value.trim() !== "" ? (
      <Money value={parsed} />
    ) : (
      <span className="text-tone-danger">{value || "—"}</span>
    );
  }

  if (isProblem) {
    return <span className="text-tone-danger">{value || "—"}</span>;
  }
  return <>{value || <span className="text-ink-400">—</span>}</>;
}
