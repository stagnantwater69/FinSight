import { useState } from "react";
import { useExpenseCategories } from "../context/ExpenseCategoryContext";

interface Props {
  value: number | "";
  onChange: (categoryId: number) => void;
}

export function CategorySelect({ value, onChange }: Props) {
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
        <div className="flex gap-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New category name"
            className="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={submitting}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-600 hover:bg-paper-100"
          >
            Cancel
          </button>
        </div>
        {error ? <p className="text-sm text-tone-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <select
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
      className="min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
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
    </select>
  );
}
