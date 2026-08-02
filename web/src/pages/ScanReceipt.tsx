import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { CategorySelect } from "../components/CategorySelect";
import { useExpenseCategories } from "../context/ExpenseCategoryContext";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import type { CategorySuggestion } from "../lib/types";
/*
 * The payload builder and the plan type both come from lib/receiptConfirm, so
 * this screen and the request it sends cannot disagree about either. "shrink"
 * is the escape hatch for the case where OCR misread the TOTAL rather than
 * missing an item — there the items are the trustworthy figure.
 */
import { buildReceiptConfirmPayload, type GapPlan } from "../lib/receiptConfirm";
import { Callout, Card, PageHead, FormPage } from "../components/ui";
import { Button } from "../components/Button";
import { Field, FileInput, FormError, MoneyInput, TextInput } from "../components/Field";
import { Money } from "../components/Money";
import { SkeletonLine } from "../components/Skeleton";
import { useToast } from "../components/Toast";

interface ScanResult {
  id: number;
  extractedDate: string | null;
  extractedVendor: string | null;
  extractedDescription: string | null;
  extractedAmount: number | null;
  /** The lines FinSight read off the receipt. Empty on a total-only receipt. */
  items: ScannedItem[];
  /**
   * True when FinSight could not read the receipt's text at all and had AI
   * interpret the photograph instead. These values are a machine's reading of
   * a picture rather than of text, and the screen says so — see the callout.
   */
  visionAssisted?: boolean;
  /**
   * How readable the photograph itself was. Present only on the upload
   * response — it answers "should you take another one?", which is only worth
   * answering while the owner is still holding the receipt.
   */
  captureQuality?: { sharpness: number; brightness: number; tooBlurredToTrust: boolean } | null;
  /** How sure OCR was about this page, 0-100. Null when not measured. */
  ocrConfidence?: number | null;
  /** The line most likely misread, when the items don't add up. */
  suspectItemId?: number | null;
}

interface ScannedItem {
  id: number;
  lineNumber: number;
  name: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
  /** FinSight's automatic assignment; the owner may change it. */
  categoryId: number | null;
  /** True for a line the owner typed in, false for one OCR read. */
  addedByOwner?: boolean;
  /**
   * True for a line AI read off the photograph because OCR found none.
   *
   * Kept distinct from an OCR-read line for the same reason addedByOwner is:
   * this screen tells the owner FinSight *read* these items, and that claim
   * must not quietly stretch to cover one a model inferred from a picture.
   */
  extractedByVision?: boolean;
  /**
   * A category FinSight thinks this item needs but the business doesn't have.
   *
   * Only ever an offer. Nothing is created until the owner accepts it — a
   * category appearing in their books that they never asked for is exactly
   * what the categoriser's grounding rules exist to prevent.
   */
  suggestedCategoryName?: string | null;
  /** How sure OCR was about THIS amount, 0-100, or null if not measured. */
  amountConfidence?: number | null;
}

/**
 * A line the owner is adding because OCR missed it.
 *
 * Held client-side until Confirm, like every other answer on this screen —
 * nothing is written until the owner accepts the whole receipt.
 */
interface AddedItem {
  /** Local only, for React keys and edits. Server ids don't exist yet. */
  key: string;
  name: string;
  amount: number | "";
  categoryId: number | "";
}

/**
 * One choice in the "what is this difference" question.
 *
 * A real radio rather than a styled button, so arrow keys move between the
 * options and a screen reader announces "2 of 3" — this is a single decision
 * with mutually exclusive answers, which is exactly what radios are.
 */
function GapOption({
  name,
  checked,
  onChange,
  label,
  detail,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: ReactNode;
  detail: ReactNode;
  children?: ReactNode;
}) {
  return (
    <label
      className={`block cursor-pointer rounded-lg border p-2 transition ${
        checked ? "border-brand-500 bg-paper-50" : "border-paper-200 hover:border-paper-300"
      }`}
    >
      <span className="flex items-start gap-2">
        <input
          type="radio"
          name={name}
          checked={checked}
          onChange={onChange}
          className="mt-0.5 shrink-0 accent-brand-700"
        />
        <span className="min-w-0">
          <span className="block text-xs font-medium text-ink-800">{label}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">{detail}</span>
        </span>
      </span>
      {children}
    </label>
  );
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

/** One category's share of a receipt. `""` is the not-yet-entered state. */
interface Split {
  categoryId: number | "";
  amount: number | "";
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
  const { categories, refresh: refreshCategories, createCategory } = useExpenseCategories();
  const navigate = useNavigate();
  const toast = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);

  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  /**
   * How the receipt's total is divided between categories.
   *
   * One entry is the ordinary case and behaves exactly as the single Category
   * field used to — its amount is the receipt total, so it needs no amount
   * input of its own. A second entry turns on the split editor, because a
   * receipt that covers two categories can no longer be described by one.
   */
  const [splits, setSplits] = useState<Split[]>([{ categoryId: "", amount: "" }]);
  const isSplit = splits.length > 1;

  /**
   * The owner's category for each extracted item, keyed by item id.
   *
   * Seeded from what FinSight assigned automatically, then owned by the
   * owner — every row is editable and nothing is written until Confirm.
   */
  const [itemCategories, setItemCategories] = useState<Record<number, number | "">>({});
  /** True while any row still differs from nothing — used only for labelling. */
  const [itemsWereAutoCategorised, setItemsWereAutoCategorised] = useState(false);
  /** The proposed category currently being created, so its row can show progress. */
  const [creatingCategoryFor, setCreatingCategoryFor] = useState<string | null>(null);
  /**
   * The category the AI proposed for a receipt with no itemised lines.
   *
   * Held as the id rather than a boolean so the "AI-suggested" chip can be
   * derived by comparing it against the field's current value — the same way
   * `originOf` distinguishes a read value from an edited one everywhere else
   * on this screen. Change the category and the chip goes away on its own,
   * because it is no longer true.
   */
  const [suggestedCategoryId, setSuggestedCategoryId] = useState<number | null>(null);

  /** Lines the owner added because OCR missed them. */
  const [addedItems, setAddedItems] = useState<AddedItem[]>([]);
  /** The extracted line currently being deleted, so its row can show progress. */
  const [removingItemId, setRemovingItemId] = useState<number | null>(null);
  /** Their choice for whatever difference remains after any added lines. */
  const [gapPlan, setGapPlan] = useState<GapPlan>(null);
  /** The category for the "put it all in one category" plan. */
  const [gapCategoryId, setGapCategoryId] = useState<number | "">("");

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const zoomRef = useRef<HTMLDialogElement>(null);

  /**
   * The scan this screen is currently showing.
   *
   * The category suggestion below is fired off after the review screen has
   * already rendered, so its answer can arrive after the owner has hit Rescan
   * and moved on to a different receipt. This is what stops a stale answer
   * landing on the new one.
   */
  const latestScanId = useRef<number | null>(null);

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
      /*
       * Reload the category list BEFORE showing the review table.
       *
       * The scan can create a category server-side: an item nothing fits
       * lands in a standing "Uncategorized" that is made on first need. The
       * client's list was fetched before that existed, so the <select> for
       * such an item had no matching <option> — and a <select> whose value
       * matches no option falls back to the first selectable one. That made
       * EVERY row display the same category (the business's first), which
       * looked exactly like the AI having assigned one category to the whole
       * receipt while the database in fact held the right per-item values.
       */
      await refreshCategories();

      latestScanId.current = data.id;
      setScan(data);
      setDate(data.extractedDate ? data.extractedDate.slice(0, 10) : "");
      setDescription(data.extractedDescription ?? "");
      setVendor(data.extractedVendor ?? "");
      setAmount(data.extractedAmount ?? "");
      // Seed the per-item categories from what FinSight assigned. Every one
      // stays editable — this is a starting point, not a decision.
      setItemCategories(Object.fromEntries(data.items.map((i) => [i.id, i.categoryId ?? ""])));
      setItemsWereAutoCategorised(data.items.some((i) => i.categoryId !== null));

      /*
       * A receipt FinSight could not itemise still deserves a starting point.
       *
       * The per-item categoriser has nothing to work with here — there are no
       * item lines — but the same classifier the Spending Impact screen uses
       * can read "Purchase from Cebu Hardware" and propose a category from
       * the business's own list. Deliberately NOT awaited: the review screen
       * is already on screen and usable, so a slow or unreachable model costs
       * the owner nothing. The field fills in a moment later, or never, and
       * they pick one themselves exactly as before.
       */
      if (data.items.length <= 1) {
        void suggestCategoryForReceipt(data);
      }
    } catch (err) {
      setScanError(getErrorMessage(err));
    } finally {
      setScanning(false);
    }
  }

  /**
   * Fills the single Category field with the classifier's best guess.
   *
   * Silent on every failure path. A missing suggestion is indistinguishable
   * from never having asked, and the owner choosing a category themselves is
   * the ordinary flow this only tries to shortcut — an error about something
   * they never requested would be noise.
   */
  async function suggestCategoryForReceipt(data: ScanResult) {
    /*
     * "Receipt purchase" is the backend's literal fallback for a receipt
     * whose vendor it could not read, so it describes nothing and would only
     * invite the classifier to guess from the word "purchase".
     */
    const description =
      data.extractedDescription && data.extractedDescription !== "Receipt purchase"
        ? data.extractedDescription
        : data.extractedVendor;
    if (!description) return;

    try {
      const { data: result } = await api.post<{ suggestion: CategorySuggestion | null }>(
        "/ai/suggest-category",
        { businessProfileId: selected!.id, description },
      );
      // A late answer for a receipt the owner has already moved on from is
      // dropped rather than applied to whatever is on screen now.
      if (!result.suggestion || latestScanId.current !== data.id) return;

      const suggestion = result.suggestion;
      // Only ever fills a field the owner has left alone. They may have
      // chosen a category while this was in flight, and a guess must never
      // overwrite a decision.
      setSplits((prev) =>
        prev.length === 1 && prev[0]!.categoryId === ""
          ? [{ ...prev[0]!, categoryId: suggestion.categoryId }]
          : prev,
      );
      setSuggestedCategoryId(suggestion.categoryId);
    } catch {
      // Nothing to say and nothing to do: the field stays empty and the owner
      // fills it in, which is what would have happened anyway.
    }
  }

  /**
   * Accepts a category FinSight proposed for items nothing existing fitted.
   *
   * Creates it, then files every UNPLACED row FinSight proposed it for — not
   * only the row that was clicked. A grocery run proposes "Packaging" on all
   * four packaging lines, and making the owner create it once and then assign
   * it three more times by hand would be busywork on a decision they have
   * just made. Rows they have already placed themselves are left alone, and
   * every row stays editable afterwards.
   */
  async function acceptSuggestedCategory(name: string) {
    setCreatingCategoryFor(name);
    setConfirmError(null);
    try {
      const created = await createCategory({ name });
      setItemCategories((prev) => {
        const next = { ...prev };
        for (const item of items) {
          const isUnplaced = next[item.id] === "" || next[item.id] === undefined || next[item.id] === uncategorisedId;
          if (isUnplaced && item.suggestedCategoryName?.toLowerCase() === name.toLowerCase()) {
            next[item.id] = created.id;
          }
        }
        return next;
      });
      toast(`Category "${created.name}" created`);
    } catch {
      setConfirmError(`Couldn't create the category "${name}". Try again, or pick one from the list.`);
    } finally {
      setCreatingCategoryFor(null);
    }
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault();
    if (!scan || amount === "" || !readyToConfirm) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      // Two shapes, one endpoint — both built in lib/receiptConfirm, where
      // they are tested against the server's real schema. This request is the
      // one that silently broke against it on mobile.
      const records = await api.post(
        `/records/receipts/${scan.id}/confirm`,
        buildReceiptConfirmPayload({
          date,
          description,
          vendor,
          amount: Number(amount),
          isItemised,
          itemAssignments: items.map((i) => ({ itemId: i.id, categoryId: Number(itemCategories[i.id]) })),
          additionalItems: addedItems.map((a) => ({
            name: a.name.trim(),
            amount: Number(a.amount),
            categoryId: Number(a.categoryId),
          })),
          itemsTotal: itemsTotalCentavos / 100,
          gapPlan,
          gapCategoryId: gapCategoryId === "" ? null : gapCategoryId,
          splits: splits.map((s) => ({
            categoryId: Number(s.categoryId),
            amount: Number(isSplit ? s.amount : amount),
          })),
        }),
      );
      const saved = (records.data as unknown[]).length;
      toast(saved === 1 ? "Expense saved from receipt" : `${saved} expenses saved from receipt`);
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
    // Any category suggestion still in flight is for the receipt being left
    // behind, so it must not land on the next one.
    latestScanId.current = null;
    setScan(null);
    setSplits([{ categoryId: "", amount: "" }]);
    setItemCategories({});
    setItemsWereAutoCategorised(false);
    setSuggestedCategoryId(null);
    setCreatingCategoryFor(null);
    setAddedItems([]);
    setGapPlan(null);
    setGapCategoryId("");
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

  /*
    Reconciliation, in centavos.

    Mirrors the server's check (receiptScan.service) exactly, so the button
    enables precisely when the request would be accepted — computed in whole
    centavos for the same reason: 1200.10 + 800.20 is not 2000.30 in binary
    floating point, and an owner whose split is right must never be told it
    isn't.
  */
  const totalCentavos = amount === "" ? 0 : Math.round(amount * 100);
  const allocatedCentavos = isSplit
    ? splits.reduce((sum, s) => sum + (s.amount === "" ? 0 : Math.round(s.amount * 100)), 0)
    : totalCentavos;
  const unallocatedCentavos = totalCentavos - allocatedCentavos;
  const everySplitHasCategory = splits.every((s) => s.categoryId !== "");
  const splitsAreComplete = everySplitHasCategory && (!isSplit || unallocatedCentavos === 0);

  function updateSplit(index: number, patch: Partial<Split>) {
    setSplits((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addSplit() {
    setSplits((prev): Split[] => {
      // Turning one category into two: the first row inherits the total it
      // already implicitly had, and the new row starts on whatever is left.
      const seeded: Split[] = prev.length === 1 ? [{ ...prev[0]!, amount }] : prev;
      return [...seeded, { categoryId: "", amount: "" }];
    });
  }

  function removeSplit(index: number) {
    setSplits((prev): Split[] => {
      const next = prev.filter((_, i) => i !== index);
      // Back to a single category — drop its amount so it re-inherits the total.
      return next.length === 1 ? [{ ...next[0]!, amount: "" }] : next;
    });
  }

  /*
   * The itemised path.
   *
   * A receipt with more than one extractable line is reviewed item by item;
   * anything less keeps the single-category flow exactly as it was. One item
   * is not a "split" — showing a grouping UI for it would be ceremony around
   * a decision the single Category dropdown already makes.
   */
  const items = scan?.items ?? [];
  const isItemised = items.length > 1;
  /** True when the item lines came from AI reading the photo, not from OCR text. */
  const itemsAreFromPhoto = items.some((i) => i.extractedByVision);

  /**
   * Items grouped by the category the owner currently has them in, with a
   * subtotal each. Recomputed on every render, so moving one row between
   * categories updates both subtotals immediately — there is no separate
   * state to fall out of step with the rows.
   */
  /**
   * Extracted lines and owner-added lines, in one list.
   *
   * Everything downstream — the subtotals, the gap, whether Confirm is
   * enabled — works off this rather than off `items`, so an added line counts
   * the moment it is complete instead of only after saving.
   */
  const reviewLines = [
    ...items.map((item) => ({
      key: `scanned-${item.id}`,
      centavos: Math.round(item.amount * 100),
      categoryId: itemCategories[item.id] ?? ("" as number | ""),
    })),
    ...addedItems
      .filter((a) => a.amount !== "")
      .map((a) => ({
        key: a.key,
        centavos: Math.round(Number(a.amount) * 100),
        categoryId: a.categoryId,
      })),
  ];

  const itemGroups = (() => {
    const groups = new Map<number | "", { centavos: number; count: number }>();
    for (const line of reviewLines) {
      const group = groups.get(line.categoryId) ?? { centavos: 0, count: 0 };
      group.centavos += line.centavos;
      group.count += 1;
      groups.set(line.categoryId, group);
    }
    return [...groups.entries()].map(([categoryId, g]) => ({
      categoryId,
      subtotal: g.centavos / 100,
      count: g.count,
    }));
  })();

  const itemsTotalCentavos = reviewLines.reduce((sum, l) => sum + l.centavos, 0);
  const everyScannedItemHasCategory = items.every(
    (i) => itemCategories[i.id] !== "" && itemCategories[i.id] !== undefined,
  );
  // An added line only counts once it is actually usable. A half-typed row
  // must not silently drag the subtotal around or enable Confirm.
  const everyAddedItemIsComplete = addedItems.every(
    (a) => a.name.trim() !== "" && a.amount !== "" && Number(a.amount) > 0 && a.categoryId !== "",
  );
  const everyItemHasCategory = everyScannedItemHasCategory && everyAddedItemIsComplete;

  const itemGapCentavos = totalCentavos - itemsTotalCentavos;

  /*
    A gap is normal, not an error.

    Item prices and the total legitimately disagree: a VAT-exclusive register
    adds tax on top of the printed lines, a discount takes money off, and OCR
    sometimes just misses a line. So the screen asks how to account for the
    difference rather than disabling Confirm until the owner makes the
    arithmetic work — which, on a VAT-exclusive receipt, they never could.

    The one thing that never happens is the total changing on its own. It is
    what the owner confirmed against the photo and what actually left their
    pocket; only the explicit "OCR misread the total" plan touches it.
  */
  const gapNeedsAPlan = itemGapCentavos !== 0;
  // A discount can't become its own expense record — that would be a negative
  // expense, which nothing downstream understands. Server enforces this too.
  const canFileGapInOneCategory = itemGapCentavos > 0;
  const gapPlanIsResolved =
    !gapNeedsAPlan ||
    gapPlan === "proportional" ||
    gapPlan === "shrink" ||
    (gapPlan === "category" && canFileGapInOneCategory && gapCategoryId !== "");

  const itemsAreComplete = everyItemHasCategory && gapPlanIsResolved;

  const readyToConfirm = isItemised ? itemsAreComplete : splitsAreComplete;

  /*
   * The amount actually sent is derived in lib/receiptConfirm, not here.
   *
   * A duplicate of that rule used to sit at this spot, left behind when the
   * payload shapes moved into the builder. It was unreferenced — so it was
   * dead weight that still had to be kept in step with the real rule, and it
   * failed the production build under noUnusedLocals. The builder is the one
   * place that decides, and it is tested against the server's schema.
   */

  function addAddedItem() {
    setAddedItems((prev) => [
      ...prev,
      { key: `added-${Date.now()}-${prev.length}`, name: "", amount: "", categoryId: "" },
    ]);
  }

  function updateAddedItem(key: string, patch: Partial<Omit<AddedItem, "key">>) {
    setAddedItems((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }

  function removeAddedItem(key: string) {
    setAddedItems((prev) => prev.filter((a) => a.key !== key));
  }

  /**
   * Drops a line OCR read that was never a purchase.
   *
   * Deleted on the server rather than hidden here, because confirmation
   * requires every STORED item to carry a category — a row this screen merely
   * stopped showing would still be on the scan, and would block Confirm with
   * a message about an item the owner can no longer see.
   *
   * The response is the scan as it now stands, so the table re-renders from
   * the server's list rather than a local guess at it. Removing a line widens
   * the gap against the total, which the reconciliation question below picks
   * up on the next render — that is the intended consequence, not a side
   * effect to suppress.
   */
  async function removeScannedItem(itemId: number) {
    if (!scan) return;
    setRemovingItemId(itemId);
    setConfirmError(null);
    try {
      const { data } = await api.delete<ScanResult>(`/records/receipts/${scan.id}/items/${itemId}`);
      setScan(data);
      setItemCategories((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } catch (err) {
      setConfirmError(getErrorMessage(err));
    } finally {
      setRemovingItemId(null);
    }
  }

  /** Category id -> its name, for the subtotal lines. */
  function categoryName(id: number | ""): string {
    return categories.find((c) => c.id === id)?.name ?? "Category";
  }

  /**
   * The standing "nothing fitted this" category, if this business has one.
   *
   * Created server-side on demand during a scan, so it may not exist at all,
   * and matched case-insensitively because an owner who already had their own
   * "Uncategorized" keeps it — the same rule the server follows.
   */
  const uncategorisedId = categories.find((c) => c.name.toLowerCase() === "uncategorized")?.id ?? null;

  /**
   * The new category FinSight proposed for a row, when it is still worth
   * offering.
   *
   * Withheld once the owner has placed the row themselves: the suggestion
   * answers "nothing here fits this", which stops being true the moment they
   * say what does. Withheld too once the category exists — which happens as
   * soon as it is accepted for a sibling row — because the offer would then
   * be to create a duplicate.
   */
  function suggestedNewCategoryFor(item: ScannedItem): string | null {
    const name = item.suggestedCategoryName;
    if (!name) return null;
    const current = itemCategories[item.id];
    const isUnplaced = current === "" || current === undefined || current === uncategorisedId;
    if (!isUnplaced) return null;
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) return null;
    return name;
  }

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
            {/*
              A receipt whose text could not be read at all.

              This is a genuinely different claim from the ordinary one below,
              and it gets its own words rather than a softer adverb. Normally
              FinSight reads characters and parses them by rule. Here it could
              not, so it asked a model what the photograph appeared to show —
              that is interpretation, not reading, and the owner is entitled to
              know which one produced the numbers they are about to accept.
            */}
            {/*
              The photograph itself, before anything about what was read from
              it. Placed first because it is the only warning with a cheaper
              answer than checking every field: the owner is still holding the
              receipt, and taking another picture costs seconds.

              Sits alongside the reading warnings rather than replacing them —
              a blurred photo and an AI-interpreted result are different
              problems and can happen together.
            */}
            {scan.captureQuality?.tooBlurredToTrust ? (
              <Callout tone="warn">
                <b className="font-semibold">This photo came out blurry.</b> FinSight read it
                anyway, but blurred print is where it makes the most mistakes. If you still have the
                receipt, taking another picture is usually quicker than correcting the figures
                below.
              </Callout>
            ) : null}

            {scan.items.some((i) => i.extractedByVision) ? (
              <Callout tone="warn">
                <b className="font-semibold">FinSight couldn't read this receipt's text.</b> These
                values were interpreted from the photo by AI, so treat them as a first guess rather
                than something read off the paper — check every one, including the total, against the
                photo before saving.
              </Callout>
            ) : scan.visionAssisted ? (
              /*
                The middle case, and it needs its own words rather than the
                strongest ones.

                Here FinSight DID read the receipt — the amounts came off the
                paper and they add up to the printed total, which is the
                arithmetic corroborating them. What it was unsure of was the
                wording beside them, so it asked a model to name the lines.
                Telling this owner "FinSight couldn't read this receipt" would
                be false, and false in the direction that makes every warning
                on this screen worth less.
              */
              <Callout tone="warn">
                <b className="font-semibold">Some item names were filled in by AI.</b> The amounts
                were read from the receipt and match its total, but the printing was faint enough
                that FinSight wasn't sure of the wording — check the item names against the photo.
              </Callout>
            ) : (
              <Callout tone="warn">
                <b className="font-semibold">Check these against your receipt before saving.</b>{" "}
                FinSight often misreads creased, faded or thermal-printed receipts. Anything you change
                here is what gets saved.
              </Callout>
            )}


            {/*
              How sure the engine was, stated as a number rather than left to
              the owner to infer from how mangled the names look. Only shown
              when it was actually measured — a vision-assisted read has no
              tesseract confidence, and a missing figure must not read as a
              low one.
            */}
            {scan.ocrConfidence !== null && scan.ocrConfidence !== undefined ? (
              <p className="-mt-1 text-xs text-ink-500">
                FinSight's reading confidence for this photo:{" "}
                <b
                  className={`font-semibold ${
                    scan.ocrConfidence >= 80
                      ? "text-tone-brand"
                      : scan.ocrConfidence >= 60
                        ? "text-tone-accent"
                        : "text-tone-danger"
                  }`}
                >
                  {scan.ocrConfidence}%
                </b>
                {scan.ocrConfidence < 80
                  ? " — check the figures below especially carefully."
                  : " — still worth a glance against the photo."}
              </p>
            ) : null}

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

            {/*
              Two review modes.

              A receipt whose lines FinSight could read is reviewed ITEM BY
              ITEM — that is the whole point of the feature, and it is what
              lets "buns" and "patty" land in Ingredients while "rice cooker"
              lands in Equipment without the owner deciding anything up front.

              A receipt with one line or none keeps exactly the flow it had:
              one Category dropdown, optionally split by hand. Showing a
              grouping UI for a single item would be ceremony around a
              decision the dropdown already makes.
            */}
            {isItemised ? (
              <fieldset>
                <legend className="text-sm font-medium text-ink-700">
                  Items on this receipt
                  <span className="ml-1 text-tone-danger" title="Required">
                    <span aria-hidden>*</span>
                    <span className="sr-only">(required)</span>
                  </span>
                </legend>
                <p className="mt-1 text-xs leading-relaxed text-ink-500">
                  {/*
                    "read" is the wrong verb for a line a model inferred from a
                    photograph, so it is not used for one. Same sentence,
                    honest verb.
                  */}
                  {itemsWereAutoCategorised ? (
                    <>
                      FinSight {itemsAreFromPhoto ? "found" : "read"} {items.length} items and put each
                      one in a category. Check them against the photo — change any that are wrong.
                    </>
                  ) : (
                    <>
                      FinSight {itemsAreFromPhoto ? "found" : "read"} {items.length} items but couldn't
                      categorise them. Put each one in a category below.
                    </>
                  )}
                </p>

                <div className="mt-2 overflow-x-auto rounded-xl border border-paper-200">
                  <table className="w-full min-w-[30rem] text-left text-sm">
                    <caption className="sr-only">
                      Each item read from the receipt, with the category it will be filed under
                    </caption>
                    <thead>
                      <tr className="border-b border-paper-200 bg-paper-100">
                        <th scope="col" className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.06em] text-ink-500">
                          Item
                        </th>
                        <th scope="col" className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.06em] text-ink-500">
                          Qty
                        </th>
                        <th scope="col" className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.06em] text-ink-500">
                          Price
                        </th>
                        <th scope="col" className="w-48 px-3 py-2 text-xs font-semibold uppercase tracking-[0.06em] text-ink-500">
                          Category
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-t border-paper-200 align-middle">
                          <td className="px-3 py-2 text-ink-800">
                            {item.name}
                            {/*
                              When the items do not add up, the server names
                              the line it is least sure of. Pointing beats
                              asking the owner to re-read all nine — and it
                              never changes the figure, because the right
                              value is not something the engine knows.
                            */}
                            {scan.suspectItemId === item.id ? (
                              <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-tint-accent px-1.5 py-0.5 text-[10px] font-medium text-tone-accent ring-1 ring-edge-accent align-middle">
                                <span aria-hidden>⚠</span>
                                Check this one first
                              </span>
                            ) : null}
                            {/*
                              Marked per row, not just once at the top, because
                              the row is where the owner decides. A line a model
                              inferred from a photograph should look different
                              from one read off text at the moment it is checked.
                            */}
                            {item.extractedByVision ? (
                              <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-tint-accent px-1.5 py-0.5 text-[10px] font-medium text-tone-accent ring-1 ring-edge-accent align-middle">
                                <span aria-hidden>✦</span>
                                AI read this from the photo
                              </span>
                            ) : null}
                          </td>
                          <td className="figure px-3 py-2 text-right text-ink-600">
                            {item.quantity ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {/* decimals: an item price is a real cent value.
                                The default whole-peso rendering reads faster in
                                summaries but here it turned 3.19 into "PHP 3",
                                which made three correct prices look like they
                                did not add up to their own correct subtotal. */}
                            <Money value={item.amount} decimals />
                            {/*
                              The engine's own doubt about THIS figure. Shown
                              only when it is low enough to act on — a
                              percentage beside every correct price would be
                              noise, and noise is what stops people checking.
                            */}
                            {typeof item.amountConfidence === "number" && item.amountConfidence < 75 ? (
                              <span
                                className="mt-0.5 block text-[10px] font-medium text-tone-accent"
                                title="How sure FinSight was when it read this amount"
                              >
                                {item.amountConfidence}% sure
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <div className="min-w-0 flex-1">
                                <label htmlFor={`item-category-${item.id}`} className="sr-only">
                                  Category for {item.name}
                                </label>
                                <CategorySelect
                                  id={`item-category-${item.id}`}
                                  value={itemCategories[item.id] ?? ""}
                                  onChange={(categoryId) =>
                                    setItemCategories((prev) => ({ ...prev, [item.id]: categoryId }))
                                  }
                                />
                              </div>
                              {/*
                                Removing a line OCR should never have read.
                                Named by the item rather than by position, so
                                the announcement says what is being removed
                                instead of "remove item 4".
                              */}
                              <button
                                type="button"
                                onClick={() => removeScannedItem(item.id)}
                                disabled={removingItemId === item.id}
                                className="tap-inline shrink-0 rounded-lg px-1.5 py-1 text-xs font-medium text-ink-500 transition hover:text-tone-danger disabled:opacity-50"
                              >
                                <span aria-hidden>×</span>
                                <span className="sr-only">
                                  Remove {item.name} — this was not a purchase
                                </span>
                              </button>
                            </div>

                            {/*
                              A category FinSight thinks is missing.

                              Shown only where it is still useful — see
                              suggestedNewCategoryFor. Phrased as an offer
                              rather than an assignment, because nothing is
                              created until the owner says so; the whole
                              reason this is a suggestion and not a decision
                              is that inventing categories in someone's books
                              is not FinSight's call to make.
                            */}
                            {suggestedNewCategoryFor(item) ? (
                              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">
                                <span aria-hidden className="text-tone-accent">
                                  ✦
                                </span>{" "}
                                Nothing fits this. FinSight suggests a new category,{" "}
                                <b className="font-semibold text-ink-700">{item.suggestedCategoryName}</b>.{" "}
                                <button
                                  type="button"
                                  onClick={() => acceptSuggestedCategory(item.suggestedCategoryName!)}
                                  disabled={creatingCategoryFor !== null}
                                  className="tap-inline font-medium text-brand-700 underline transition hover:text-brand-800 disabled:opacity-50"
                                >
                                  {creatingCategoryFor === item.suggestedCategoryName
                                    ? "Creating…"
                                    : "Create it"}
                                  <span className="sr-only"> and file {item.name} under it</span>
                                </button>
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      ))}

                      {/*
                        Lines the owner is adding because OCR missed them.

                        Kept visually distinct from the extracted rows: the
                        panel above claims FinSight READ these items off the
                        receipt, and that claim must not quietly extend to a
                        row a human typed. The same distinction is stored
                        server-side (ReceiptScanItem.addedByOwner) so it
                        survives onto the saved record.
                      */}
                      {addedItems.map((added, i) => (
                        <tr key={added.key} className="border-t border-paper-200 bg-paper-50 align-middle">
                          <td className="px-3 py-2">
                            <label htmlFor={`added-name-${added.key}`} className="sr-only">
                              Name for added item {i + 1}
                            </label>
                            <TextInput
                              id={`added-name-${added.key}`}
                              placeholder="Item name"
                              value={added.name}
                              onChange={(e) => updateAddedItem(added.key, { name: e.target.value })}
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-ink-400">—</td>
                          <td className="px-3 py-2">
                            <label htmlFor={`added-amount-${added.key}`} className="sr-only">
                              Amount for added item {i + 1}
                            </label>
                            <MoneyInput
                              id={`added-amount-${added.key}`}
                              min={0.01}
                              value={added.amount}
                              onChange={(e) =>
                                updateAddedItem(added.key, {
                                  amount: e.target.value === "" ? "" : Number(e.target.value),
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <div className="min-w-0 flex-1">
                                <label htmlFor={`added-category-${added.key}`} className="sr-only">
                                  Category for added item {i + 1}
                                </label>
                                <CategorySelect
                                  id={`added-category-${added.key}`}
                                  value={added.categoryId}
                                  onChange={(categoryId) => updateAddedItem(added.key, { categoryId })}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => removeAddedItem(added.key)}
                                className="tap-inline shrink-0 rounded-lg px-1.5 py-1 text-xs font-medium text-ink-500 transition hover:text-tone-danger"
                              >
                                <span aria-hidden>×</span>
                                <span className="sr-only">Remove added item {i + 1}</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/*
                  The live per-category subtotals. Derived from the rows on
                  every render rather than held in their own state, so moving
                  one item between categories cannot leave a stale figure
                  behind — both affected subtotals change in the same paint.
                */}
                <div className="mt-3 rounded-xl bg-paper-100 p-3">
                  <p className="text-xs font-semibold text-ink-600">What gets saved</p>
                  <ul className="mt-1.5 space-y-1">
                    {itemGroups.map((group) => (
                      <li
                        key={String(group.categoryId)}
                        className="flex items-baseline justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 truncate text-ink-700">
                          {group.categoryId === "" ? (
                            <span className="text-tone-accent">Not categorised yet</span>
                          ) : (
                            categoryName(group.categoryId)
                          )}
                          <span className="ml-1.5 text-xs text-ink-400">
                            ({group.count} item{group.count === 1 ? "" : "s"})
                          </span>
                        </span>
                        <span className="figure shrink-0 font-medium text-ink-900">
                          <Money value={group.subtotal} decimals />
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p
                    aria-live="polite"
                    className={`mt-2 flex items-center gap-1.5 border-t border-paper-200 pt-2 text-xs font-medium ${
                      itemsAreComplete ? "text-tone-brand" : "text-tone-accent"
                    }`}
                  >
                    <span aria-hidden>{itemsAreComplete ? "✓" : "⚠"}</span>
                    {!everyItemHasCategory ? (
                      <>Every item needs a category before this can be saved.</>
                    ) : itemGapCentavos === 0 ? (
                      <>
                        {itemGroups.length} record{itemGroups.length === 1 ? "" : "s"} will be saved, adding
                        up to the receipt total.
                      </>
                    ) : gapPlan === "shrink" ? (
                      <>
                        The receipt will be saved as <Money value={itemsTotalCentavos / 100} decimals /> —
                        the items' own total — instead of the amount above.
                      </>
                    ) : gapPlanIsResolved ? (
                      <>
                        {itemGroups.length + (gapPlan === "category" ? 1 : 0)} record
                        {itemGroups.length + (gapPlan === "category" ? 1 : 0) === 1 ? "" : "s"} will be saved,
                        adding up to the receipt total of{" "}
                        <Money value={totalCentavos / 100} decimals />.
                      </>
                    ) : itemGapCentavos > 0 ? (
                      <>
                        The items come to <Money value={itemsTotalCentavos / 100} decimals />, which is{" "}
                        <Money value={itemGapCentavos / 100} decimals /> less than the receipt total above.
                      </>
                    ) : (
                      <>
                        The items come to <Money value={itemsTotalCentavos / 100} decimals />, which is{" "}
                        <Money value={-itemGapCentavos / 100} decimals /> more than the receipt total above.
                      </>
                    )}
                  </p>

                  {gapPlan === "proportional" && gapNeedsAPlan ? (
                    <p className="mt-1 text-xs text-ink-500">
                      Each category above will carry its share of the{" "}
                      <Money value={Math.abs(itemGapCentavos) / 100} decimals bare /> when saved.
                    </p>
                  ) : null}
                </div>

                {/*
                  Accounting for the difference.

                  A gap is normal rather than a mistake: a VAT-exclusive
                  register adds tax on top of the printed lines, a discount
                  takes money off, and OCR sometimes just misses one. The old
                  screen offered a single way out — set the receipt total down
                  to the items — which balances the arithmetic by DELETING
                  money the owner really spent. On a receipt totalling 1,120
                  with 1,000 of items, that filed a 1,000 expense.

                  So the owner is asked what the difference actually is. The
                  total they confirmed against the photo is the anchor and
                  never moves on its own; only the last option, for a total
                  OCR misread, changes it, and then only to figures read off
                  the receipt.
                */}
                {everyItemHasCategory && gapNeedsAPlan ? (
                  <fieldset className="mt-3 rounded-xl border border-tone-accent/30 bg-tone-accent/5 p-3">
                    <legend className="px-1 text-xs font-semibold text-ink-700">
                      {itemGapCentavos > 0 ? (
                        <>
                          What is the missing <Money value={itemGapCentavos / 100} decimals bare />?
                        </>
                      ) : (
                        <>
                          What is the extra <Money value={-itemGapCentavos / 100} decimals bare />?
                        </>
                      )}
                    </legend>

                    <p className="mt-1 text-xs leading-relaxed text-ink-500">
                      {itemGapCentavos > 0
                        ? "Receipts often add tax or a service charge on top of the item prices, and sometimes a line just doesn't scan."
                        : "A discount or a voided line usually explains this."}
                    </p>

                    <div className="mt-2 space-y-1.5">
                      <GapOption
                        name="gap-plan"
                        checked={gapPlan === "proportional"}
                        onChange={() => setGapPlan("proportional")}
                        label={itemGapCentavos > 0 ? "Tax or a service charge" : "A discount on the whole receipt"}
                        detail="Split across the categories above, in proportion to what each one came to. Keeps every category's spending accurate."
                      />

                      {canFileGapInOneCategory ? (
                        <GapOption
                          name="gap-plan"
                          checked={gapPlan === "category"}
                          onChange={() => setGapPlan("category")}
                          label="A separate charge to track on its own"
                          detail="Saved as its own expense record under one category."
                        >
                          {gapPlan === "category" ? (
                            <div className="mt-1.5">
                              <label htmlFor="gap-category" className="sr-only">
                                Category for the remaining amount
                              </label>
                              <CategorySelect id="gap-category" value={gapCategoryId} onChange={setGapCategoryId} />
                            </div>
                          ) : null}
                        </GapOption>
                      ) : null}

                      <GapOption
                        name="gap-plan"
                        checked={gapPlan === "shrink"}
                        onChange={() => setGapPlan("shrink")}
                        label="FinSight misread the receipt total"
                        detail={
                          <>
                            Save <Money value={itemsTotalCentavos / 100} decimals bare /> — the items' own
                            total — instead of the amount above.
                          </>
                        }
                      />
                    </div>

                    {/*
                      A missing line is not a category question, so it sits
                      apart from the radios: adding it changes the gap rather
                      than explaining it, and often closes it entirely.
                    */}
                    <button
                      type="button"
                      onClick={addAddedItem}
                      className="tap-inline mt-2.5 border-t border-tone-accent/20 pt-2 text-xs font-medium text-brand-700 transition hover:text-brand-800"
                    >
                      + An item is missing — add it to the list
                    </button>
                  </fieldset>
                ) : null}
              </fieldset>
            ) : !isSplit ? (
              <Field
                label="Category"
                htmlFor="category"
                required
                /*
                  Says plainly that this one was written by the AI.
                  Derived by comparing the field against what was suggested
                  rather than held as a flag, so it disappears by itself the
                  moment the owner picks something else — at which point the
                  value is theirs and calling it AI-suggested would be wrong.
                */
                labelAction={
                  suggestedCategoryId !== null && splits[0]!.categoryId === suggestedCategoryId ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-tint-info px-2 py-0.5 text-[11px] font-medium text-tone-info ring-1 ring-edge-info">
                      <span aria-hidden>✦</span>
                      AI-suggested — check it
                    </span>
                  ) : null
                }
                hint="One receipt often covers more than one kind of spending — split it if this one does."
              >
                <CategorySelect
                  id="category"
                  value={splits[0]!.categoryId}
                  onChange={(id) => updateSplit(0, { categoryId: id })}
                />
              </Field>
            ) : (
              <fieldset>
                <legend className="text-sm font-medium text-ink-700">
                  Split across categories
                  <span className="ml-1 text-tone-danger" title="Required">
                    <span aria-hidden>*</span>
                    <span className="sr-only">(required)</span>
                  </span>
                </legend>
                <p className="mt-1 text-xs leading-relaxed text-ink-500">
                  Every peso on the receipt has to land in a category, so the parts add up to the total
                  you confirmed above.
                </p>

                <ul className="mt-2 space-y-2">
                  {splits.map((split, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <label htmlFor={`split-category-${i}`} className="sr-only">
                          Category for part {i + 1}
                        </label>
                        <CategorySelect
                          id={`split-category-${i}`}
                          value={split.categoryId}
                          onChange={(id) => updateSplit(i, { categoryId: id })}
                        />
                      </div>
                      <div className="w-36 shrink-0">
                        <label htmlFor={`split-amount-${i}`} className="sr-only">
                          Amount for part {i + 1}
                        </label>
                        <MoneyInput
                          id={`split-amount-${i}`}
                          min={0.01}
                          required
                          value={split.amount}
                          onChange={(e) =>
                            updateSplit(i, { amount: e.target.value === "" ? "" : Number(e.target.value) })
                          }
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSplit(i)}
                        aria-label={`Remove part ${i + 1}`}
                        className="tap mt-0.5 h-11 w-9 min-h-0 min-w-0 shrink-0 rounded-lg text-ink-400 transition hover:bg-paper-100 hover:text-tone-danger"
                      >
                        <span aria-hidden>×</span>
                      </button>
                    </li>
                  ))}
                </ul>

                <p
                  aria-live="polite"
                  className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${
                    unallocatedCentavos === 0 ? "text-tone-brand" : "text-tone-accent"
                  }`}
                >
                  <span aria-hidden>{unallocatedCentavos === 0 ? "✓" : "⚠"}</span>
                  {unallocatedCentavos === 0 ? (
                    <>The parts add up to the receipt total.</>
                  ) : unallocatedCentavos > 0 ? (
                    <>
                      <Money value={unallocatedCentavos / 100} /> of the total isn't assigned yet.
                    </>
                  ) : (
                    <>
                      The parts are <Money value={-unallocatedCentavos / 100} /> over the receipt total.
                    </>
                  )}
                </p>
              </fieldset>
            )}

            {/* Splitting by hand is for receipts FinSight could NOT itemise. */}
            {!isItemised ? (
              <button
                type="button"
                onClick={addSplit}
                className="tap-inline text-sm font-medium text-brand-700 transition hover:text-brand-800"
              >
                + Add another category
              </button>
            ) : null}

            {isItemised && itemsWereAutoCategorised ? (
              <Callout tone="info">
                <b className="font-semibold">FinSight chose these categories</b> by reading the item names.
                It gets item lines wrong more often than it gets a total wrong, so check each row against
                the photo before saving. Anything you change here is what gets saved.
              </Callout>
            ) : null}

            {confirmError ? <FormError>{confirmError}</FormError> : null}

            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                variant="primary"
                disabled={confirming || !readyToConfirm}
                className="flex-1"
              >
                {confirming
                  ? "Saving…"
                  : (() => {
                      // The label promises the number of RECORDS, which on the
                      // itemised path is the number of category groups — not
                      // the number of items. Fourteen groceries in two
                      // categories save as two expenses, and the button has to
                      // say so or the Records table is a surprise.
                      const n = isItemised ? itemGroups.length : isSplit ? splits.length : 1;
                      return n === 1 ? "Confirm & save expense" : `Confirm & save ${n} expenses`;
                    })()}
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
