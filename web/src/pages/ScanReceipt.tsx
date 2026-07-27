import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { CategorySelect } from "../components/CategorySelect";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { FormPage } from "../components/ui";
import { Button } from "../components/Button";
import { Field, FileInput, FormError, MoneyInput, TextInput } from "../components/Field";

interface ScanResult {
  id: number;
  extractedDate: string | null;
  extractedVendor: string | null;
  extractedDescription: string | null;
  extractedAmount: number | null;
}

export function ScanReceipt() {
  const { selected } = useBusinessProfiles();
  const navigate = useNavigate();

  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);

  const [categoryId, setCategoryId] = useState<number | "">("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (!selected) return null;

  async function handleScan(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setScanning(true);
    setScanError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("businessProfileId", String(selected!.id));
      const { data } = await api.post<ScanResult>("/records/receipts", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setScan(data);
      setDate(data.extractedDate ? data.extractedDate.slice(0, 10) : "");
      setDescription(data.extractedDescription ?? "");
      setVendor(data.extractedVendor ?? "");
      setAmount(data.extractedAmount ?? "");
    } catch (err) {
      setScanError(getErrorMessage(err));
    } finally {
      setScanning(false);
    }
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault();
    if (!scan || !categoryId || amount === "") return;
    setConfirming(true);
    setConfirmError(null);
    try {
      await api.post(`/records/receipts/${scan.id}/confirm`, {
        categoryId,
        date,
        description,
        vendor: vendor || undefined,
        amount,
      });
      navigate("/records");
    } catch (err) {
      setConfirmError(getErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <FormPage eyebrow="Records" title="Scan a receipt">

      {!scan ? (
        <form onSubmit={handleScan} className="space-y-4">
          <Field label="Receipt image" htmlFor="file" required>
            <FileInput
              accept="image/jpeg,image/png,image/webp"
              maxBytes={8 * 1024 * 1024}
              file={file}
              onSelect={setFile}
              hintText="JPEG, PNG or WEBP, up to 8MB. A flat, well-lit photo reads best."
            />
          </Field>
          {scanError ? <FormError>{scanError}</FormError> : null}
          <Button type="submit" variant="primary" fullWidth disabled={scanning || !file}>
            {scanning ? "Reading receipt…" : "Scan receipt"}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleConfirm} className="space-y-4">
          <p className="rounded-lg bg-tint-brand px-3 py-2 text-xs text-tone-brand">
            Here's what FinSight could read from your receipt — double check and correct anything before
            saving.
          </p>
          <Field label="Category" htmlFor="category" required>
            <CategorySelect id="category" value={categoryId} onChange={setCategoryId} />
          </Field>
          <Field label="Date" htmlFor="date" required>
            <TextInput type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Description" htmlFor="description" required>
            <TextInput required value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Vendor" htmlFor="vendor" optional>
            <TextInput value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </Field>
          <Field label="Amount" htmlFor="amount" required>
            <MoneyInput
              min={0.01}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </Field>
          {confirmError ? <FormError>{confirmError}</FormError> : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="primary" disabled={confirming} className="flex-1">
              {confirming ? "Saving…" : "Confirm & save expense"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setScan(null)}>
              Rescan
            </Button>
          </div>
        </form>
      )}
    </FormPage>
  );
}
