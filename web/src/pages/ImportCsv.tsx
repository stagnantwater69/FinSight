import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { FormPage } from "../components/ui";
import { Button } from "../components/Button";
import { Field, FileInput, FormError, SelectInput, TextInput } from "../components/Field";

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

  if (!selected) return null;


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
    } catch (err) {
      setPreviewError(getErrorMessage(err));
    } finally {
      setPreviewing(false);
    }
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault();
    if (!file || !dateCol || !descriptionCol || !amountCol) return;
    if (recordType === "expense" && !categoryCol) return;
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
    return (
      <FormPage eyebrow="Records" title="Import complete">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-500">Rows in file</dt>
            <dd className="font-medium text-ink-900">{result.totalRows}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">Imported</dt>
            <dd className="font-medium text-ink-900">{result.imported}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">Skipped</dt>
            <dd className="font-medium text-ink-900">{result.skipped.length}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">Flagged as possible duplicates</dt>
            <dd className="font-medium text-ink-900">{result.flagged}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">Flagged as large expenses</dt>
            <dd className="font-medium text-ink-900">{result.largeExpenseFlagged ?? 0}</dd>
          </div>
        </dl>
        {result.skipped.length > 0 ? (
          <div className="mt-4 rounded-lg bg-tint-danger p-3 text-xs text-tone-danger">
            <p className="mb-1 font-medium">Skipped rows:</p>
            <ul className="list-inside list-disc space-y-0.5">
              {result.skipped.map((s) => (
                <li key={s.row}>
                  Row {s.row}: {s.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <Link
          to="/records"
          className="mt-6 block w-full rounded-lg bg-brand-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-brand-700"
        >
          Back to records
        </Link>
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
          <ColumnPicker label="Date column" headers={preview.headers} value={dateCol} onChange={setDateCol} />
          <ColumnPicker
            label="Description column"
            headers={preview.headers}
            value={descriptionCol}
            onChange={setDescriptionCol}
          />
          <ColumnPicker
            label="Amount column"
            headers={preview.headers}
            value={amountCol}
            onChange={setAmountCol}
          />
          {recordType === "expense" ? (
            <ColumnPicker
              label="Category column"
              headers={preview.headers}
              value={categoryCol}
              onChange={setCategoryCol}
            />
          ) : null}

          <div>
            <p className="mb-1 text-xs font-medium text-ink-500">
              Preview ({preview.totalRows} row{preview.totalRows === 1 ? "" : "s"} total)
            </p>
            <div className="max-h-48 overflow-auto rounded-lg border border-paper-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-paper-100">
                  <tr>
                    {preview.headers.map((h) => (
                      <th key={h} className="px-2 py-1 font-medium text-ink-600">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.previewRows.map((row, i) => (
                    <tr key={i} className="border-t border-paper-200">
                      {preview.headers.map((h) => (
                        <td key={h} className="px-2 py-1 text-ink-700">
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {confirmError ? <FormError>{confirmError}</FormError> : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="primary" disabled={confirming} className="flex-1">
              {confirming ? "Importing…" : "Confirm import"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPreview(null)}>
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
}: {
  label: string;
  headers: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label} required>
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
