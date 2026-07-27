import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CategorySelect } from "../components/CategorySelect";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import type { RecordItem } from "../lib/types";
import { FormPage } from "../components/ui";
import { Button } from "../components/Button";
import { Field, FormError, MoneyInput, TextInput } from "../components/Field";

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
        {error ? <FormError>{error}</FormError> : null}
        <Button type="submit" variant="primary" fullWidth disabled={submitting}>
          {submitting ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </FormPage>
  );
}
