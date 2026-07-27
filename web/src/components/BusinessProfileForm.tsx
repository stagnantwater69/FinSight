import { useState, type FormEvent } from "react";
import type { BusinessProfileInput } from "../lib/types";

interface Props {
  initialValues?: BusinessProfileInput;
  submitLabel: string;
  onSubmit: (input: BusinessProfileInput) => Promise<void>;
}

const defaultValues: BusinessProfileInput = {
  name: "",
  type: "",
  availableFunds: 0,
  expectedMonthlyExpenses: 0,
  operatingDays: 26,
  largeExpenseThresholdPercent: 20,
};

export function BusinessProfileForm({ initialValues, submitLabel, onSubmit }: Props) {
  const [form, setForm] = useState<BusinessProfileInput>(initialValues ?? defaultValues);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof BusinessProfileInput>(key: K, value: BusinessProfileInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-ink-700">
          Business name
        </label>
        <input
          id="name"
          required
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="e.g. Aling Nena Sari-Sari Store"
          className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
        />
      </div>
      <div>
        <label htmlFor="type" className="block text-sm font-medium text-ink-700">
          Business type
        </label>
        <input
          id="type"
          required
          value={form.type}
          onChange={(e) => update("type", e.target.value)}
          placeholder="e.g. Sari-sari store, food business, tire shop"
          className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="availableFunds" className="block text-sm font-medium text-ink-700">
            Available funds (PHP)
          </label>
          <input
            id="availableFunds"
            type="number"
            min={0}
            step="0.01"
            required
            value={form.availableFunds}
            onChange={(e) => update("availableFunds", Number(e.target.value))}
            className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="expectedMonthlyExpenses" className="block text-sm font-medium text-ink-700">
            Expected monthly expenses (PHP)
          </label>
          <input
            id="expectedMonthlyExpenses"
            type="number"
            min={0}
            step="0.01"
            required
            value={form.expectedMonthlyExpenses}
            onChange={(e) => update("expectedMonthlyExpenses", Number(e.target.value))}
            className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="operatingDays" className="block text-sm font-medium text-ink-700">
            Operating days per month
          </label>
          <input
            id="operatingDays"
            type="number"
            min={1}
            max={31}
            required
            value={form.operatingDays}
            onChange={(e) => update("operatingDays", Number(e.target.value))}
            className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
          />
        </div>
        <div>
          <label htmlFor="largeExpenseThresholdPercent" className="block text-sm font-medium text-ink-700">
            Large expense threshold (%)
          </label>
          <input
            id="largeExpenseThresholdPercent"
            type="number"
            min={0.01}
            max={999.99}
            step="0.01"
            required
            value={form.largeExpenseThresholdPercent}
            onChange={(e) => update("largeExpenseThresholdPercent", Number(e.target.value))}
            className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
          />
          <p className="mt-1 text-xs text-ink-400">
            Expenses at or above this % of your expected monthly expenses get flagged as large.
          </p>
        </div>
      </div>
      {error ? <p className="text-sm text-tone-danger">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto"
      >
        {submitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
