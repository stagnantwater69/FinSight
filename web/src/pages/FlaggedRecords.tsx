import { useEffect, useState } from "react";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import type { RecordItem } from "../lib/types";
import { PageHead } from "../components/ui";

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

      {error ? <p className="mb-4 text-sm text-tone-danger">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : records.length === 0 ? (
        <p className="rounded-2xl bg-paper p-6 text-sm text-ink-500 border border-paper-200 shadow-sm">
          Nothing needs review right now.
        </p>
      ) : (
        <div className="space-y-3">
          {records.map((r) => {
            const key = `${r.type}-${r.id}`;
            return (
              <div key={key} className="rounded-2xl bg-paper p-4 border border-paper-200 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink-900">{r.description}</p>
                    <p className="text-xs text-ink-500">
                      {r.date.slice(0, 10)} · <span className="capitalize">{r.type}</span> · PHP{" "}
                      {r.amount.toLocaleString()}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.duplicateStatus === "Flagged" ? (
                        <span className="rounded-full bg-tint-accent px-2 py-0.5 text-xs font-medium text-tone-accent">
                          Possible duplicate
                          {r.duplicateOfRecordId ? ` of record #${r.duplicateOfRecordId}` : ""}
                        </span>
                      ) : null}
                      {r.largeExpenseFlag ? (
                        <span className="rounded-full bg-paper-100 px-2 py-0.5 text-xs font-medium text-ink-700">
                          Large expense
                        </span>
                      ) : null}
                      {r.reviewStatus === "Needs Review" &&
                      !r.largeExpenseFlag &&
                      r.duplicateStatus !== "Flagged" ? (
                        <span className="rounded-full bg-tint-danger px-2 py-0.5 text-xs font-medium text-tone-danger">
                          Needs review
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-2 text-sm">
                    <button
                      type="button"
                      disabled={busyId === key}
                      onClick={() => handleKeep(r)}
                      className="rounded-lg border border-brand-300 px-3 py-1.5 font-medium text-tone-brand hover:bg-tint-brand disabled:opacity-60"
                    >
                      Keep
                    </button>
                    <button
                      type="button"
                      disabled={busyId === key}
                      onClick={() => handleDiscard(r)}
                      className="rounded-lg border border-edge-danger px-3 py-1.5 font-medium text-tone-danger hover:bg-tint-danger disabled:opacity-60"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
