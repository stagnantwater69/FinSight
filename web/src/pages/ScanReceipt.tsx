import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { CategorySelect } from "../components/CategorySelect";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { Callout, Card, PageHead, FormPage } from "../components/ui";
import { Button } from "../components/Button";
import { Field, FileInput, FormError, MoneyInput, TextInput } from "../components/Field";
import { SkeletonLine } from "../components/Skeleton";
import { useToast } from "../components/Toast";

interface ScanResult {
  id: number;
  extractedDate: string | null;
  extractedVendor: string | null;
  extractedDescription: string | null;
  extractedAmount: number | null;
}

/**
 * Where a field's current value came from.
 *
 * This is the mechanism behind UAT item 29 ("it was clear I could correct the
 * scanned details before saving"). Previously every field was an ordinary
 * input: a vendor OCR failed to read looked exactly like a vendor the owner had
 * deliberately cleared, and nothing on screen distinguished a value FinSight
 * guessed from one the owner typed. The only signal was a single 12px line
 * above the whole form.
 */
type Origin = "read" | "derived" | "missing" | "edited";

function originOf(current: string, extracted: string | null): Origin {
  if (extracted === null || extracted === "") return current === "" ? "missing" : "edited";
  return current === extracted ? "read" : "edited";
}

const ORIGIN_CHIP: Partial<Record<Origin, { label: string; tone: string }>> = {
  read: { label: "Read from receipt", tone: "bg-tint-info text-tone-info ring-edge-info" },
  derived: { label: "Suggested from the vendor", tone: "bg-tint-info text-tone-info ring-edge-info" },
  missing: { label: "Not found — please enter", tone: "bg-tint-accent text-tone-accent ring-edge-accent" },
};

function OriginChip({ origin }: { origin: Origin }) {
  const spec = ORIGIN_CHIP[origin];
  if (!spec) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${spec.tone}`}
    >
      <span aria-hidden>{origin === "missing" ? "⚠" : "✦"}</span>
      {spec.label}
    </span>
  );
}

/**
 * A field whose value FinSight guessed.
 *
 * The wash marks it as provisional and clears the moment the owner edits it,
 * so "FinSight said this" and "I said this" never look the same.
 *
 * `!bg-*` is deliberate: the base control class sets `bg-paper`, and two
 * background utilities in one class attribute resolve by stylesheet order, not
 * by the order they are written here. The important modifier is what makes the
 * override deterministic.
 */
function provisionalClass(origin: Origin): string {
  if (origin === "read" || origin === "derived") return "!bg-tint-info";
  if (origin === "missing") return "!bg-tint-accent";
  return "";
}

function ScannedField({
  label,
  htmlFor,
  origin,
  required,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  origin: Origin;
  required?: boolean;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <Field
      label={label}
      htmlFor={htmlFor}
      required={required}
      optional={optional}
      labelAction={<OriginChip origin={origin} />}
    >
      {children}
    </Field>
  );
}

export function ScanReceipt() {
  const { selected } = useBusinessProfiles();
  const navigate = useNavigate();
  const toast = useToast();

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

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const zoomRef = useRef<HTMLDialogElement>(null);

  /**
   * The receipt preview.
   *
   * Built from the local File rather than the stored image, so it appears
   * instantly and costs no request — the server does return the uploaded
   * image's path, but fetching it back to show the user the picture they just
   * picked would be absurd. The object URL is revoked when the file changes or
   * the page unmounts; without that, every rescan leaks a blob.
   */
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

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
      toast("Expense saved from receipt");
      navigate("/records");
    } catch (err) {
      setConfirmError(getErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  }

  /**
   * Back to the file picker, without dragging the last scan's answers along.
   *
   * This used to only null `scan`, which left every extracted value and the
   * chosen category sitting in state. Re-submitting the same file then produced
   * a second ReceiptScan row and a second stored image server-side while the
   * first was orphaned in "Pending". The image is deliberately kept — the
   * common case is rescanning the same photo — but everything derived from the
   * previous read is cleared.
   */
  function handleRescan() {
    setScan(null);
    setCategoryId("");
    setDate("");
    setDescription("");
    setVendor("");
    setAmount("");
    setConfirmError(null);
    setScanError(null);
  }

  // OCR never reads a description. The backend synthesises one from the vendor
  // ("Purchase from X") and falls back to the literal "Receipt purchase" when
  // it found no vendor — which means a null check would call that fallback a
  // successful read. Treating it as "not found" is the honest reading, and it
  // is what prompts the owner to write something meaningful.
  const descriptionOrigin: Origin =
    scan?.extractedDescription === "Receipt purchase"
      ? description === ""
        ? "missing"
        : "edited"
      : description === scan?.extractedDescription
        ? "derived"
        : "edited";

  const receiptPreview = previewUrl ? (
    <>
      <button
        type="button"
        onClick={() => zoomRef.current?.showModal()}
        className="block w-full cursor-zoom-in overflow-hidden rounded-xl border border-paper-200 bg-paper-100"
      >
        <img
          src={previewUrl}
          alt="The receipt you uploaded"
          className="mx-auto max-h-[70vh] w-full object-contain"
        />
      </button>
      <p className="mt-2 text-center text-xs text-ink-400">Tap the photo to enlarge it.</p>

      <dialog
        ref={zoomRef}
        onClick={() => zoomRef.current?.close()}
        className="confirm-dialog max-h-[92vh] w-[min(60rem,calc(100vw-2rem))] rounded-2xl border border-paper-200 bg-paper p-2"
      >
        <img src={previewUrl} alt="The receipt you uploaded, enlarged" className="w-full object-contain" />
        <p className="py-2 text-center text-xs text-ink-500">Tap anywhere to close.</p>
      </dialog>
    </>
  ) : null;

  // ---- stage 1: choose a photo ------------------------------------------
  if (!scan) {
    return (
      <FormPage eyebrow="Records" title="Scan a receipt">
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

          {receiptPreview}

          {scanError ? <FormError>{scanError}</FormError> : null}

          {/*
            The OCR wait is the app's slowest interaction and it cannot be made
            fast, so the interface commits to the shape of the answer instead —
            the reason Skeleton.tsx exists. Previously the only feedback was the
            button's label changing.
          */}
          {scanning ? (
            <div aria-busy="true" aria-live="polite" className="space-y-3 rounded-xl bg-paper-100 p-4">
              <span className="sr-only">Reading your receipt…</span>
              <p className="text-xs font-medium text-ink-500">Reading your receipt…</p>
              <SkeletonLine className="w-1/3" />
              <SkeletonLine className="w-full" />
              <SkeletonLine className="w-2/3" />
              <SkeletonLine className="w-1/2" />
            </div>
          ) : null}

          <Button type="submit" variant="primary" fullWidth disabled={scanning || !file}>
            {scanning ? "Reading receipt…" : "Scan receipt"}
          </Button>
        </form>
      </FormPage>
    );
  }

  // ---- stage 2: check what it read --------------------------------------
  //
  // Deliberately NOT inside FormPage: the whole job of this screen is letting
  // the owner read the receipt and the extracted values at the same time, and
  // FormPage's single measure column cannot hold both side by side.
  return (
    <div>
      <PageHead
        eyebrow="Records"
        title="Check what FinSight read"
        subtitle="Compare each value against the photo before saving."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 lg:sticky lg:top-24 lg:self-start">
          {receiptPreview ?? (
            <p className="py-8 text-center text-sm text-ink-400">
              The photo isn't available to show here, but the values below are the ones FinSight read from
              it.
            </p>
          )}
        </Card>

        <Card className="p-5 sm:p-6">
          <form onSubmit={handleConfirm} className="space-y-4">
            {/*
              Promoted from a 12px tinted line to a real callout. Item 29 exists
              because the design assumes owners notice they can correct these,
              and it was previously the quietest element on the screen. The
              warning about creased printing is not hedging — the OCR accuracy
              measured on the corpus was against mostly clean printed receipts.
            */}
            <Callout tone="warn">
              <b className="font-semibold">Check these against your receipt before saving.</b> FinSight
              often misreads creased, faded or thermal-printed receipts. Anything you change here is what
              gets saved.
            </Callout>

            <Field label="Category" htmlFor="category" required>
              <CategorySelect id="category" value={categoryId} onChange={setCategoryId} />
            </Field>

            <ScannedField
              label="Date"
              htmlFor="date"
              required
              origin={originOf(date, scan.extractedDate ? scan.extractedDate.slice(0, 10) : null)}
            >
              <TextInput
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={provisionalClass(
                  originOf(date, scan.extractedDate ? scan.extractedDate.slice(0, 10) : null),
                )}
              />
            </ScannedField>

            <ScannedField label="Description" htmlFor="description" required origin={descriptionOrigin}>
              <TextInput
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What did you buy?"
                className={provisionalClass(descriptionOrigin)}
              />
            </ScannedField>

            <ScannedField
              label="Vendor"
              htmlFor="vendor"
              optional
              origin={originOf(vendor, scan.extractedVendor)}
            >
              <TextInput
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className={provisionalClass(originOf(vendor, scan.extractedVendor))}
              />
            </ScannedField>

            <ScannedField
              label="Amount"
              htmlFor="amount"
              required
              origin={originOf(String(amount), scan.extractedAmount === null ? null : String(scan.extractedAmount))}
            >
              <MoneyInput
                min={0.01}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                className={provisionalClass(
                  originOf(
                    String(amount),
                    scan.extractedAmount === null ? null : String(scan.extractedAmount),
                  ),
                )}
              />
            </ScannedField>

            {confirmError ? <FormError>{confirmError}</FormError> : null}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="primary" disabled={confirming} className="flex-1">
                {confirming ? "Saving…" : "Confirm & save expense"}
              </Button>
              <Button type="button" variant="secondary" onClick={handleRescan}>
                Rescan
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
