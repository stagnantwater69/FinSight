import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CategorySelect } from "../components/CategorySelect";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import type { RecordItem } from "../lib/types";
import { FormPage } from "../components/ui";

export function EditExpense() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<RecordItem | null>(null);
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<RecordItem>(`/records/expenses/${id}`).then(({ data }) => {
      setRecord(data);
      setCategoryId(data.categoryId ?? "");
      setDate(data.date.slice(0, 10));
      setDescription(data.description);
      setVendor(data.vendor ?? "");
      setAmount(data.amount);
    });
  }, [id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!categoryId || amount === "") return;
    setError(null);
    setSubmitting(true);
    try {
      await api.patch(`/records/expenses/${id}`, {
        categoryId,
        date,
        description,
        vendor: vendor || null,
        amount,
      });
      navigate("/records");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!record) {
    return <p className="text-sm text-ink-500">Loading…</p>;
  }

  return (
    <FormPage eyebrow="Records" title="Edit expense">
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
        {error ? <p className="text-sm text-tone-danger">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="tap w-full rounded-lg bg-accent-400 px-4 text-sm font-semibold text-ink-900 shadow-sm hover:bg-accent-500 disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
      </form>
    </FormPage>
  );
}
