import { useEffect, useState } from "react";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import type { RecordItem } from "../lib/types";
import { Card, PageHead } from "../components/ui";
import { AlertBadge } from "../components/Alert";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { FormError } from "../components/Field";
import { Money } from "../components/Money";
import { SkeletonRows } from "../components/Skeleton";

export function FlaggedRecords() {
  const { selected } = useBusinessProfiles();
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

  async function handleKeep(record: RecordItem) {
    setBusyId(`${record.type}-${record.id}`);
    try {
      await api.patch(path(record), { duplicateStatus: "Not a Duplicate", reviewStatus: "Reviewed" });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDiscard(record: RecordItem) {
    if (!confirm(`Discard "${record.description}"? This deletes the record entirely.`)) return;
    setBusyId(`${record.type}-${record.id}`);
    try {
      await api.delete(path(record));
      await load();
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
                    {/*
                      The three flags use the Alert family's badges rather than
                      pills invented here, so a flag on this page and the same
                      flag in the notification list are recognisably one thing —
                      same glyph, same colour, same words.
                    */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.duplicateStatus === "Flagged" ? <AlertBadge kind="duplicate" /> : null}
                      {r.largeExpenseFlag ? <AlertBadge kind="large-expense" /> : null}
                      {r.reviewStatus === "Needs Review" &&
                      !r.largeExpenseFlag &&
                      r.duplicateStatus !== "Flagged" ? (
                        <AlertBadge kind="needs-review" />
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
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
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
