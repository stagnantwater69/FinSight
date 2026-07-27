import { useState } from "react";
import { useExpenseCategories } from "../context/ExpenseCategoryContext";
import { SelectInput, TextInput } from "./Field";
import { Button } from "./Button";

interface Props {
  value: number | "";
  onChange: (categoryId: number) => void;
  /**
   * The id the <select> carries, so an enclosing <Field>'s label resolves to
   * it. Without this the Category field was the one unlabelled control in the
   * app: the label had no htmlFor and this component rendered no matching id.
   */
  id?: string;
}

export function CategorySelect({ value, onChange, id }: Props) {
  const { categories, createCategory, loading } = useExpenseCategories();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate() {
    if (!newName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const category = await createCategory({ name: newName.trim() });
      onChange(category.id);
      setCreating(false);
      setNewName("");
    } catch {
      setError("Couldn't create category. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (creating) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <TextInput
            id={id}
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New category name"
            aria-label="New category name"
            className="min-w-0 flex-1"
          />
          <Button type="button" onClick={handleCreate} disabled={submitting || !newName.trim()}>
            Add
          </Button>
          <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
            Cancel
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-tone-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <SelectInput
      id={id}
      required
      value={value}
      onChange={(e) => {
        if (e.target.value === "__new__") {
          setCreating(true);
          return;
        }
        onChange(Number(e.target.value));
      }}
      disabled={loading}
    >
      <option value="" disabled>
        {loading ? "Loading categories…" : "Select a category"}
      </option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value="__new__">+ New category…</option>
    </SelectInput>
  );
}
