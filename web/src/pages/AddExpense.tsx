import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { CategorySelect } from "../components/CategorySelect";
import { Celebration } from "../components/Confirmation";
import { hasCelebratedFirstRecord, markFirstRecordCelebrated } from "../components/Confirmation";
import { ButtonLink } from "../components/Button";
import { Money } from "../components/Money";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import type { RecordItem } from "../lib/types";
import { FormPage } from "../components/ui";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function AddExpense() {
  const { selected } = useBusinessProfiles();
  const navigate = useNavigate();
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Peak-End: the first expense a business ever records is the moment the
  // product becomes true for this owner. It earns a real confirmation screen
  // rather than a silent redirect back to an empty list.
  const [firstRecord, setFirstRecord] = useState<RecordItem | null>(null);

  if (!selected) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!categoryId || amount === "") return;
    setError(null);
    setSubmitting(true);
    try {
      const { data } = await api.post<RecordItem>("/records/expenses", {
        businessProfileId: selected!.id,
        categoryId,
        date,
        description,
        vendor: vendor || undefined,
        amount,
      });

      // Only celebrate if this business has never done it before.
      const existing = await api.get<RecordItem[]>("/records/search", {
        params: { businessProfileId: selected!.id, type: "expense" },
      });
      const isFirst = existing.data.length <= 1 && !hasCelebratedFirstRecord(selected!.id);

      if (isFirst) {
        markFirstRecordCelebrated(selected!.id);
        setFirstRecord(data);
        return;
      }
      navigate("/records");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (firstRecord) {
    return (
      <div className="mx-auto w-full max-w-md">
        <Celebration
          title="That's your first expense recorded"
          action={
            <>
              <ButtonLink to="/dashboard" variant="primary">
                See your dashboard
              </ButtonLink>
              <ButtonLink to="/records/expenses/new" variant="secondary">
                Add another
              </ButtonLink>
            </>
          }
        >
          <span className="block">
            <strong className="text-ink-800">{firstRecord.description}</strong> —{" "}
            <Money value={firstRecord.amount} />
          </span>
          <span className="mt-2 block">
            Keep going for a few days and FinSight can start showing you where your money actually goes.
          </span>
        </Celebration>
        <p className="mt-4 text-center text-sm">
          <Link to="/records" className="tap-inline font-medium text-brand-700 hover:text-brand-800">
            Back to all records
          </Link>
        </p>
      </div>
    );
  }

  return (
    <FormPage eyebrow="Records" title="Add expense">
      <form onSubmit={handleSubmit} className="space-y-4">
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
            placeholder="e.g. Rice sacks"
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
        {error ? (
          <p className="rounded-lg bg-tint-danger p-3 text-sm text-tone-danger ring-1 ring-edge-danger">{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="tap w-full rounded-lg bg-accent-400 px-4 text-sm font-semibold text-ink-900 shadow-sm hover:bg-accent-500 disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Save expense"}
        </button>
      </form>
    </FormPage>
  );
}
