import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { FormPage } from "../components/ui";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function AddSalesRecord() {
  const { selected } = useBusinessProfiles();
  const navigate = useNavigate();
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("Daily sales");
  const [amount, setAmount] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!selected) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (amount === "") return;
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/records/sales", {
        businessProfileId: selected!.id,
        date,
        description,
        amount,
      });
      navigate("/records");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormPage eyebrow="Records" title="Add sales reference">
      <form onSubmit={handleSubmit} className="space-y-4">
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
          {submitting ? "Saving…" : "Save sales reference"}
        </button>
      </form>
    </FormPage>
  );
}
