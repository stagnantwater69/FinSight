import { useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { CategorySelect } from "../components/CategorySelect";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { FormPage } from "../components/ui";

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

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
  }

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
          <div>
            <label htmlFor="file" className="block text-sm font-medium text-ink-700">
              Receipt image (JPEG, PNG, or WEBP)
            </label>
            <input
              id="file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              onChange={handleFileChange}
              className="mt-1 w-full text-sm"
            />
          </div>
          {scanError ? <p className="text-sm text-tone-danger">{scanError}</p> : null}
          <button
            type="submit"
            disabled={scanning || !file}
            className="tap w-full rounded-lg bg-accent-400 px-4 text-sm font-semibold text-ink-900 shadow-sm hover:bg-accent-500 disabled:opacity-60"
          >
            {scanning ? "Reading receipt…" : "Scan receipt"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleConfirm} className="space-y-4">
          <p className="rounded-lg bg-tint-brand px-3 py-2 text-xs text-tone-brand">
            Here's what FinSight could read from your receipt — double check and correct anything before
            saving.
          </p>
          <div>
            <label className="block text-sm font-medium text-ink-700">Category</label>
            <div className="mt-1">
              <CategorySelect value={categoryId} onChange={setCategoryId} />
            </div>
          </div>
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-ink-700">
              Date
            </label>
            <input
              id="date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-ink-700">
              Description
            </label>
            <input
              id="description"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
            />
          </div>
          <div>
            <label htmlFor="vendor" className="block text-sm font-medium text-ink-700">
              Vendor <span className="text-ink-400">(optional)</span>
            </label>
            <input
              id="vendor"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
            />
          </div>
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-ink-700">
              Amount (PHP)
            </label>
            <input
              id="amount"
              type="number"
              min={0.01}
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
              className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
            />
          </div>
          {confirmError ? <p className="text-sm text-tone-danger">{confirmError}</p> : null}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={confirming}
              className="tap flex-1 rounded-lg bg-accent-400 px-4 text-sm font-semibold text-ink-900 shadow-sm hover:bg-accent-500 disabled:opacity-60"
            >
              {confirming ? "Saving…" : "Confirm & save expense"}
            </button>
            <button
              type="button"
              onClick={() => setScan(null)}
              className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-paper-100"
            >
              Rescan
            </button>
          </div>
        </form>
      )}
    </FormPage>
  );
}
