import { useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { useToast } from "./Toast";
import { Field, FormError, MoneyInput, TextInput } from "./Field";
import { CategorySelect } from "./CategorySelect";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * "Add expense" as a popup on the Records page — see AddSalesModal for why
 * this doesn't reuse the full-page AddExpense.tsx. That page's first-expense
 * celebration doesn't come along either: a full-screen "you did it" moment
 * doesn't fit inside a modal that's about to close, and it still fires the
 * first time an owner uses the full-page route (Quick Add, Dashboard's empty
 * state) if they never happen to use this popup first.
 */
export function AddExpenseModal({
  businessProfileId,
  open,
  onClose,
  onSaved,
}: {
  businessProfileId: number;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setCategoryId("");
    setDate(today());
    setDescription("");
    setVendor("");
    setAmount("");
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!categoryId || amount === "") return;
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/records/expenses", {
        businessProfileId,
        categoryId,
        date,
        description,
        vendor: vendor || undefined,
        amount,
      });
      toast("Expense saved");
      reset();
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add expense">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Category" htmlFor="modal-expense-category" required>
          <CategorySelect id="modal-expense-category" value={categoryId} onChange={setCategoryId} />
        </Field>
        <Field label="Date" htmlFor="modal-expense-date" required>
          <TextInput type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="modal-expense-description" required>
          <TextInput
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Rice sacks"
          />
        </Field>
        <Field label="Vendor" htmlFor="modal-expense-vendor" optional>
          <TextInput value={vendor} onChange={(e) => setVendor(e.target.value)} />
        </Field>
        <Field label="Amount" htmlFor="modal-expense-amount" required>
          <MoneyInput
            min={0.01}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </Field>
        {error ? <FormError>{error}</FormError> : null}
        <Button type="submit" variant="primary" fullWidth disabled={submitting}>
          {submitting ? "Saving…" : "Save expense"}
        </Button>
      </form>
    </Modal>
  );
}
