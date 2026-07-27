import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { Callout, FormPage } from "../components/ui";
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
const HEADER_SYNONYMS: Record<"date" | "description" | "amount" | "category", string[]> = {
  date: ["date", "txn date", "transaction date", "trans date", "posted", "day", "petsa"],
  description: ["description", "item", "particulars", "details", "detail", "memo", "notes", "note"],
  amount: ["amount", "total", "price", "cost", "value", "debit", "halaga"],
  category: ["category", "type", "class", "account", "group", "uri"],
};

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
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  /** Which fields were guessed rather than chosen, so each can say so. */
  const [autoMapped, setAutoMapped] = useState<Set<string>>(new Set());

  if (!selected) return null;

  /**
   * One CSV column mapped to two FinSight fields is always a mistake — it would
   * import the description as the amount, or the date as the category — and
   * nothing stopped it before.
   */
  const activeMapping: [string, string][] = [
    ["date", dateCol],
    ["description", descriptionCol],
    ["amount", amountCol],
    ...(recordType === "expense" ? ([["category", categoryCol]] as [string, string][]) : []),
  ];

  const duplicateColumns = new Set(
    activeMapping
      .map(([, col]) => col)
      .filter((col, i, all) => col !== "" && all.indexOf(col) !== i),
  );

  const mappingIsComplete = activeMapping.every(([, col]) => col !== "");
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
      };
      setDateCol(guessed.date);
      setDescriptionCol(guessed.description);
      setAmountCol(guessed.amount);
      setCategoryCol(guessed.category);
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
    setAutoMapped(new Set());
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
        }),
      );
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

  return (
    <FormPage eyebrow="Records" title="Import CSV records" subtitle="Map your spreadsheet's columns to FinSight's fields. Columns you don't map are ignored." wide>

      {!preview ? (
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
      ) : (
        <form onSubmit={handleConfirm} className="space-y-4">
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

          <p className="text-xs font-medium text-ink-500">Map your CSV columns:</p>
          <ColumnPicker
            label="Date column"
            headers={preview.headers}
            value={dateCol}
            onChange={(v) => {
              setDateCol(v);
              clearAuto("date");
            }}
            autoMatched={autoMapped.has("date")}
            error={duplicateError(dateCol)}
          />
          <ColumnPicker
            label="Description column"
            headers={preview.headers}
            value={descriptionCol}
            onChange={(v) => {
              setDescriptionCol(v);
              clearAuto("description");
            }}
            autoMatched={autoMapped.has("description")}
            error={duplicateError(descriptionCol)}
          />
          <ColumnPicker
            label="Amount column"
            headers={preview.headers}
            value={amountCol}
            onChange={(v) => {
              setAmountCol(v);
              clearAuto("amount");
            }}
            autoMatched={autoMapped.has("amount")}
            error={duplicateError(amountCol)}
          />
          {recordType === "expense" ? (
            <ColumnPicker
              label="Category column"
              headers={preview.headers}
              value={categoryCol}
              onChange={(v) => {
                setCategoryCol(v);
                clearAuto("category");
              }}
              autoMatched={autoMapped.has("category")}
              error={duplicateError(categoryCol)}
            />
          ) : null}

          {/*
            The preview shows the file THROUGH the mapping, under FinSight's own
            column names, rather than echoing the raw spreadsheet back. The raw
            version answered "did the file parse?"; this one answers the
            question the owner actually has, which is "is this what will end up
            in my records?".
          */}
          <div>
            <p className="mb-1 text-xs font-medium text-ink-500">
              This is what will be imported ({preview.totalRows} row
              {preview.totalRows === 1 ? "" : "s"} in the file)
            </p>
            {mappingIsComplete ? (
              <div className="max-h-56 overflow-auto rounded-lg border border-paper-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-paper-100">
                    <tr>
                      <th className="px-2 py-1.5 font-medium text-ink-600">Date</th>
                      <th className="px-2 py-1.5 font-medium text-ink-600">Description</th>
                      {recordType === "expense" ? (
                        <th className="px-2 py-1.5 font-medium text-ink-600">Category</th>
                      ) : null}
                      <th className="px-2 py-1.5 text-right font-medium text-ink-600">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.previewRows.map((row, i) => {
                      const raw = row[amountCol] ?? "";
                      const parsed = Number(raw.replace(/,/g, ""));
                      return (
                        <tr key={i} className="border-t border-paper-200">
                          <td className="px-2 py-1.5 text-ink-700">{row[dateCol]}</td>
                          <td className="px-2 py-1.5 text-ink-700">{row[descriptionCol]}</td>
                          {recordType === "expense" ? (
                            <td className="px-2 py-1.5 text-ink-700">{row[categoryCol]}</td>
                          ) : null}
                          <td className="px-2 py-1.5 text-right text-ink-700">
                            {Number.isFinite(parsed) && raw !== "" ? (
                              <Money value={parsed} />
                            ) : (
                              <span className="text-tone-danger">{raw || "—"}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-ink-200 bg-paper-100 p-4 text-center text-xs text-ink-500">
                Finish mapping the columns above to see what will be imported.
              </div>
            )}
          </div>

          {confirmError ? <FormError>{confirmError}</FormError> : null}
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              variant="primary"
              disabled={confirming || !mappingIsValid}
              className="flex-1"
            >
              {confirming ? "Importing…" : "Confirm import"}
            </Button>
            <Button type="button" variant="secondary" onClick={handleChooseDifferentFile}>
              Choose a different file
            </Button>
          </div>
        </form>
      )}
    </FormPage>
  );
}

function ColumnPicker({
  label,
  headers,
  value,
  onChange,
  autoMatched = false,
  error = null,
}: {
  label: string;
  headers: string[];
  value: string;
  onChange: (v: string) => void;
  /** Says so when FinSight guessed this, so a wrong guess is easy to spot. */
  autoMatched?: boolean;
  error?: string | null;
}) {
  return (
    <Field
      label={label}
      required
      error={error}
      hint={autoMatched ? "Matched automatically — change it if that's wrong." : undefined}
    >
      <SelectInput required value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Select a column
        </option>
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </SelectInput>
    </Field>
  );
}
