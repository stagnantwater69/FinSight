import { useState, type FormEvent } from "react";
import type { BusinessProfileInput } from "../lib/types";
import { Button } from "./Button";
import { Field, FormError, MoneyInput, TextInput } from "./Field";
import { InfoNote } from "./ui";

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
      <Field label="Business name" htmlFor="name" required>
        <TextInput
          required
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="e.g. Aling Nena Sari-Sari Store"
        />
      </Field>
      <Field label="Business type" htmlFor="type" required>
        <TextInput
          required
          value={form.type}
          onChange={(e) => update("type", e.target.value)}
          placeholder="e.g. Sari-sari store, food business, tire shop"
        />
      </Field>

      {/*
        These three figures drive every downstream insight — the recovery
        target, the daily target, and the large-expense threshold all derive
        from them. An owner who misreads one gets wrong numbers everywhere and
        has no way to tell, so each says plainly what it is asking for and what
        it affects. Plain language, not accounting language: the target user is
        a sari-sari store owner, not a bookkeeper.
      */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Available business funds"
          htmlFor="availableFunds"
          required
          hint="Roughly how much cash the business has to work with right now. You'll update this as things change — FinSight doesn't read your bank."
        >
          <MoneyInput
            min={0}
            required
            value={form.availableFunds}
            onChange={(e) => update("availableFunds", Number(e.target.value))}
          />
        </Field>
        <Field
          label="Expected monthly expenses"
          htmlFor="expectedMonthlyExpenses"
          required
          hint="What a normal month costs you — rent, stock, wages, utilities. FinSight uses this to work out how much you need to sell."
        >
          <MoneyInput
            min={0}
            required
            value={form.expectedMonthlyExpenses}
            onChange={(e) => update("expectedMonthlyExpenses", Number(e.target.value))}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Operating days per month"
          htmlFor="operatingDays"
          required
          hint="How many days a month the business is actually open. Used to spread your target across the days you can actually sell."
        >
          <TextInput
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            required
            value={form.operatingDays}
            onChange={(e) => update("operatingDays", Number(e.target.value))}
          />
        </Field>
        <Field
          label="Large expense threshold (%)"
          htmlFor="largeExpenseThresholdPercent"
          required
          hint="An expense at or above this share of your expected monthly expenses gets flagged for review. Lower it to catch more, raise it if FinSight is flagging ordinary purchases."
        >
          <TextInput
            type="number"
            inputMode="decimal"
            min={0.01}
            max={999.99}
            step="0.01"
            required
            value={form.largeExpenseThresholdPercent}
            onChange={(e) => update("largeExpenseThresholdPercent", Number(e.target.value))}
          />
        </Field>
      </div>

      {/*
        The worked example uses the same figures as the Landing page's live
        RecoveryMeter demo (DEMO_BASE in pages/Landing.tsx), so what an owner
        was shown before signing up and what they are told here agree.
      */}
      <InfoNote>
        <b className="font-semibold text-ink-700">How these fit together.</b> If a normal month costs
        you <span className="figure">PHP 125,000</span> and you're open{" "}
        <span className="figure">25</span> days, FinSight works out a daily target of{" "}
        <span className="figure">PHP 5,000</span> — that's the number that tells you what today needs
        to look like.
      </InfoNote>

      {error ? <FormError>{error}</FormError> : null}
      <Button type="submit" variant="primary" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
