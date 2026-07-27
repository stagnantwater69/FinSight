import { useState } from "react";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";

interface Props {
  businessProfileId: number;
  module: "Expense Insights" | "Spending Impact" | "Recovery Target";
  context: string;
}

export function ExplainButton({ businessProfileId, module, context }: Props) {
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExplain() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post<{ answer: string }>("/ai/ask", {
        businessProfileId,
        module,
        question: "Explain what these numbers mean for my business, in plain language.",
        context,
      });
      setAnswer(data.answer);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (answer) {
    return (
      <div className="rounded-lg bg-tint-brand p-3 text-sm text-tone-brand">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-600">FinSight explains</p>
        <p>{answer}</p>
        <button
          type="button"
          onClick={() => setAnswer(null)}
          className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-800"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleExplain}
        disabled={loading}
        className="tap rounded-lg border border-brand-300 px-3 text-sm font-medium text-tone-brand hover:bg-tint-brand disabled:opacity-60"
      >
        {loading ? "Thinking…" : "Explain this"}
      </button>
      {error ? <p className="mt-1 text-xs text-tone-danger">{error}</p> : null}
    </div>
  );
}
