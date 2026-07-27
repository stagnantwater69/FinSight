import { useEffect, useState } from "react";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import type { RecordItem } from "../lib/types";
import { Link } from "react-router-dom";
import type { BusinessProfile } from "../lib/types";
import { Card, PageHead } from "../components/ui";
import { Alert } from "../components/Alert";
import { SkeletonLine } from "../components/Skeleton";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { FormError } from "../components/Field";
import { Money } from "../components/Money";
import { SkeletonRows } from "../components/Skeleton";
import { useConfirm } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";

/**
 * Why a record was flagged, stated in the owner's own numbers.
 *
 * Both rules live on the backend but are entirely reconstructible here, which
 * is why this needs no API change:
 *
 *   large expense — amount >= expectedMonthlyExpenses × (threshold% / 100)
 *                   (expenseRecord.service.ts). Both operands are on the
 *                   BusinessProfile already in context, and the percentage is
 *                   a field the owner sets themselves — so this is a rule they
 *                   chose, and saying so is what makes it feel like a setting
 *                   rather than an accusation.
 *
 *   duplicate     — same business, same date, same amount, and a
 *                   case-insensitively identical description (findDuplicate).
 *                   Exact on all four, which is worth stating plainly: it
 *                   explains why two genuinely similar purchases on the same
 *                   day DO get flagged.
 *
 * UAT items 30 and 33 are both about this. "Possible duplicate of record #412"
 * told the owner nothing they could act on.
 */
function LargeExpenseReason({ record, profile }: { record: RecordItem; profile: BusinessProfile }) {
  const threshold =
    Number(profile.expectedMonthlyExpenses) * (Number(profile.largeExpenseThresholdPercent) / 100);

  if (!Number.isFinite(threshold) || threshold <= 0) {
    return (
      <>
        This is large relative to your usual spending. Set your expected monthly expenses in your business
        profile and FinSight can be specific about the threshold.
      </>
    );
  }

  return (
    <>
      <Money value={record.amount} /> is at or above your large-expense threshold of{" "}
      <Money value={threshold} /> — that's {profile.largeExpenseThresholdPercent}% of your{" "}
      <Money value={profile.expectedMonthlyExpenses} /> expected monthly expenses.{" "}
      <Link to="/business-profiles" className="tap-inline font-medium text-brand-700 underline-offset-2 hover:underline">
        Change the threshold
      </Link>{" "}
      if this is normal for your business.
    </>
  );
}

/** The record this one duplicates, shown rather than referenced by id. */
function DuplicateOf({ record }: { record: RecordItem }) {
  const [other, setOther] = useState<RecordItem | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!record.duplicateOfRecordId) return;
    const path =
      record.type === "expense"
        ? `/records/expenses/${record.duplicateOfRecordId}`
        : `/records/sales/${record.duplicateOfRecordId}`;
    let cancelled = false;
    api
      .get<RecordItem>(path)
      .then(({ data }) => {
        if (!cancelled) setOther(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [record.duplicateOfRecordId, record.type]);

  if (!record.duplicateOfRecordId || failed) {
    return (
      <>
        Another record in this business has the same date, the same amount and the same description.
      </>
    );
  }

  return (
    <>
      <span className="block">
        It has the same date, amount and description as a record you already had:
      </span>
      <span className="mt-1.5 block rounded-lg bg-paper-100 px-2.5 py-2 ring-1 ring-paper-200">
        {other ? (
          <>
            <span className="font-medium text-ink-800">{other.description}</span>
            <span className="block text-ink-500">
              {other.date.slice(0, 10)} · <Money value={other.amount} />
            </span>
          </>
        ) : (
          <SkeletonLine className="w-40" />
        )}
      </span>
    </>
  );
}

export function FlaggedRecords() {
  const { selected } = useBusinessProfiles();
  const confirm = useConfirm();
  const toast = useToast();
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<RecordItem[]>("/records/flagged", {
        params: { businessProfileId: selected.id },
      });
      setRecords(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  function path(record: RecordItem) {
    return record.type === "expense" ? `/records/expenses/${record.id}` : `/records/sales/${record.id}`;
  }

  /** The edit screen. `path` already computed this URL, but only for the API. */
  function editPath(record: RecordItem) {
    return record.type === "expense"
      ? `/records/expenses/${record.id}/edit`
      : `/records/sales/${record.id}/edit`;
  }

  /**
   * `intent` changes only the wording, not the request — the API has one way to
   * resolve a flag. It is worth distinguishing anyway: "Keep" means "yes, that
   * happened", and "this is normal" means "your rule is wrong about my
   * business", and echoing back which one the owner said is what makes the
   * second feel heard rather than ignored.
   */
  async function handleKeep(record: RecordItem, intent: "keep" | "normal" = "keep") {
    setBusyId(`${record.type}-${record.id}`);
    try {
      await api.patch(path(record), { duplicateStatus: "Not a Duplicate", reviewStatus: "Reviewed" });
      await load();
      // Naming the record matters here: the row vanishes from the queue on
      // success, so without it the owner has no confirmation of WHICH one they
      // just resolved.
      toast(
        intent === "normal"
          ? `Noted — "${record.description}" is normal for your business`
          : `Kept "${record.description}"`,
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDiscard(record: RecordItem) {
    const ok = await confirm({
      title: `Discard "${record.description}"?`,
      body: <>This deletes the record entirely. It won't appear in your history or in any insight.</>,
      confirmLabel: "Discard record",
      tone: "danger",
    });
    if (!ok) return;

    setBusyId(`${record.type}-${record.id}`);
    try {
      await api.delete(path(record));
      await load();
      toast(`Discarded "${record.description}"`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  if (!selected) return null;

  return (
    <div>
      <PageHead
        eyebrow="Records management"
        title="Review flagged records"
        subtitle={`Records FinSight wants a second look at, for ${selected.name}.`}
      />

      {error ? (
        <div className="mb-4">
          <FormError>{error}</FormError>
        </div>
      ) : null}

      {loading ? (
        <Card>
          <SkeletonRows rows={4} />
        </Card>
      ) : records.length === 0 ? (
        <EmptyState title="Nothing needs review right now" icon="✓">
          FinSight flags a record when it looks like a duplicate or is unusually large for your business.
          When one turns up, it will be waiting here.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {records.map((r) => {
            const key = `${r.type}-${r.id}`;
            return (
              <Card key={key} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">{r.description}</p>
                    <p className="text-xs text-ink-500">
                      {r.date.slice(0, 10)} · <span className="capitalize">{r.type}</span> ·{" "}
                      <Money value={r.amount} />
                    </p>
                    <Link
                      to={editPath(r)}
                      className="tap-inline mt-1 inline-block text-xs font-medium text-brand-700 underline-offset-2 hover:underline"
                    >
                      Open this record
                    </Link>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === key}
                      onClick={() => handleKeep(r)}
                    >
                      Keep
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busyId === key}
                      onClick={() => handleDiscard(r)}
                    >
                      Discard
                    </Button>
                  </div>
                </div>

                {/*
                  The reason, not just the label. Each flag uses the Alert
                  family's severity grammar, so a flag here and the same flag in
                  the notification list are recognisably one thing — and each
                  states the rule that fired, in this owner's own figures.
                */}
                <div className="mt-3 space-y-2">
                  {r.duplicateStatus === "Flagged" ? (
                    <Alert kind="duplicate">
                      <DuplicateOf record={r} />
                    </Alert>
                  ) : null}
                  {r.largeExpenseFlag ? (
                    <Alert kind="large-expense">
                      <LargeExpenseReason record={r} profile={selected} />
                    </Alert>
                  ) : null}
                  {r.reviewStatus === "Needs Review" &&
                  !r.largeExpenseFlag &&
                  r.duplicateStatus !== "Flagged" ? (
                    <Alert kind="needs-review">
                      This record is waiting on your confirmation before FinSight counts it as settled.
                    </Alert>
                  ) : null}
                </div>

                {/*
                  Item 33 exists because unusual-expense detection is known to
                  over-flag categories with only a handful of records. Keeping a
                  record and saying "this is normal" are the same API call, but
                  they are different statements — offering the second by name
                  makes dismissing a false alarm one click, and gives the study
                  something to count.
                */}
                {r.largeExpenseFlag ? (
                  <div className="mt-3 border-t border-paper-200 pt-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === key}
                      onClick={() => handleKeep(r, "normal")}
                    >
                      This is normal for my business
                    </Button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
