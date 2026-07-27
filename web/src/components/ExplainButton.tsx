import { useState } from "react";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { AiCard } from "./ui";
import { Button } from "./Button";
import { SkeletonBubble } from "./Skeleton";
import type { AskResponse } from "../lib/types";

interface Props {
  businessProfileId: number;
  module: "Expense Insights" | "Spending Impact" | "Recovery Target";
  context: string;
}

/**
 * "Explain this" — an AI reading of the figures already on the page.
 *
 * The answer renders in <AiCard>, and that is the whole point of this
 * component's shape. ui.tsx states the rule plainly: AiCard's dark surface and
 * footer exist "so an AI-written explanation is never mistaken for a computed
 * figure", and the disclaimer "is not optional decoration — it is the honesty
 * requirement the brief puts on every AI surface."
 *
 * This component used to break that rule. It rendered LLM prose on the same
 * pale brand tint the app uses for its own computed notes, under a small
 * "FinSight explains" heading and no disclaimer at all — on Expense Insights,
 * Spending Impact and Recovery Target. Those were the only AI surfaces in the
 * app not marked as AI, which is precisely the confusion UAT item 19 ("I trust
 * the numbers FinSight showed me") is scored on. An owner who cannot tell a
 * computed figure from a generated sentence has no basis for trusting either.
 */
export function ExplainButton({ businessProfileId, module, context }: Props) {
  const [answer, setAnswer] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExplain() {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const { data } = await api.post<AskResponse>("/ai/ask", {
        businessProfileId,
        module,
        question: "Explain what these numbers mean for my business, in plain language.",
        context,
      });
      setAnswer(data.answer);
      // Both providers failed. The backend still returns a placeholder answer
      // with 201, so it has to be surfaced as an outage rather than left to
      // read like a considered response — the same check the drawer makes.
      if (data.provider === "unavailable") setUnavailable(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">FinSight is writing an explanation…</span>
        <SkeletonBubble />
      </div>
    );
  }

  if (answer) {
    return (
      <AiCard
        title="FinSight explains"
        subtitle={
          unavailable ? "The assistant is unavailable right now" : "AI-written from the figures on this page"
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Written by AI from your own records. The figures above are computed — this explanation of
              them is not.
            </span>
            <button
              type="button"
              onClick={() => setAnswer(null)}
              className="shrink-0 font-semibold text-accent-200 underline-offset-2 hover:underline"
            >
              Dismiss
            </button>
          </div>
        }
      >
        {answer}
      </AiCard>
    );
  }

  return (
    <div>
      <Button type="button" variant="secondary" size="sm" onClick={handleExplain}>
        <span aria-hidden>✦</span> Explain this
      </Button>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-tone-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
