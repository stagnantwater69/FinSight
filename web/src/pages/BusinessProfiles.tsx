import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { getErrorMessage } from "../lib/errors";
import { formatMoney } from "../components/Money";
import { Button, ButtonLink } from "../components/Button";
import { DataTable, type Column } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { PageHead, Pill } from "../components/ui";
import { TextInput } from "../components/Field";
import { IconSearch } from "../components/icons";
import type { BusinessProfile } from "../lib/types";

/**
 * Business profiles.
 *
 * Rebuilt onto the shared <DataTable>. It was a grid of cards, which looked
 * fine at two businesses and stopped working at fifteen — no sort, no search,
 * and no way to compare available funds across them without scrolling and
 * remembering. The table gives all three, and still falls back to a card list
 * on phones where a six-column comparison genuinely doesn't fit.
 *
 * Archiving keeps its own panel below rather than becoming a table filter:
 * archived businesses are deliberately out of the way, and folding them into
 * the main list as a greyed row invites restoring one by accident.
 */
export function BusinessProfiles() {
  const { profiles, selected, selectProfile, loading, archiveProfile, restoreProfile, listArchived } =
    useBusinessProfiles();

  const [archived, setArchived] = useState<BusinessProfile[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => p.name.toLowerCase().includes(q) || p.type.toLowerCase().includes(q));
  }, [profiles, keyword]);

  async function loadArchived() {
    setError(null);
    try {
      setArchived(await listArchived());
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleArchive(profile: BusinessProfile) {
    // Archiving is reversible, but it still pulls a business out of the
    // switcher — worth one confirmation, and worth saying plainly that the
    // records survive so it isn't mistaken for a delete.
    const ok = confirm(
      `Archive "${profile.name}"?\n\n` +
        "It will be hidden from your list of businesses. Nothing is deleted — " +
        "all its records, insights and conversations are kept, and you can restore it at any time.",
    );
    if (!ok) return;

    setBusyId(profile.id);
    setError(null);
    try {
      await archiveProfile(profile.id);
      if (archived) await loadArchived();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRestore(profile: BusinessProfile) {
    setBusyId(profile.id);
    setError(null);
    try {
      await restoreProfile(profile.id);
      await loadArchived();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  // The archived panel is rendered in both the empty and populated states —
  // an owner who archives their only business must still be able to find it.
  const archivedPanel = (
    <div className="mt-8">
      {archived === null ? (
        <button
          type="button"
          onClick={loadArchived}
          className="tap rounded-lg px-3 text-sm font-medium text-ink-500 transition hover:bg-paper-100 hover:text-ink-800"
        >
          Show archived businesses
        </button>
      ) : (
        <div className="animate-slide-up rounded-2xl border border-paper-200 bg-paper p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-800">Archived businesses</h2>
            <button
              type="button"
              onClick={() => setArchived(null)}
              className="tap rounded-lg px-2 text-xs font-medium text-ink-400 transition hover:bg-paper-100 hover:text-ink-700"
            >
              Hide
            </button>
          </div>
          {archived.length === 0 ? (
            <p className="text-sm text-ink-400">You have no archived businesses.</p>
          ) : (
            <ul className="divide-y divide-paper-200">
              {archived.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-800">{p.name}</p>
                    <p className="text-xs text-ink-400">
                      {p.type}
                      {p.archivedAt ? ` · archived ${p.archivedAt.slice(0, 10)}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleRestore(p)}
                    disabled={busyId === p.id}
                  >
                    {busyId === p.id ? "Restoring…" : "Restore"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-400">
            Archived businesses keep all their records, insights and conversations. Restoring one brings it
            back exactly as it was.
          </p>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div>
        <PageHead eyebrow="Management" title="Business profiles" />
        <div className="skeleton h-64 rounded-2xl" aria-hidden />
        <span className="sr-only" aria-live="polite">
          Loading your businesses…
        </span>
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div>
        <PageHead eyebrow="Management" title="Business profiles" />
        <EmptyState
          title="Let's set up your first business"
          action={
            <ButtonLink to="/business-profiles/new" variant="primary">
              Create a business profile
            </ButtonLink>
          }
        >
          Add a business profile to start tracking its funds, expenses, and sales in FinSight.
        </EmptyState>
        {error ? <p className="mt-4 text-sm text-tone-danger">{error}</p> : null}
        {archivedPanel}
      </div>
    );
  }

  const columns: Column<BusinessProfile>[] = [
    {
      key: "name",
      header: "Business",
      width: "grow",
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 font-medium text-ink-900">{p.name}</span>
          {p.id === selected?.id ? <Pill tone="ok">Active</Pill> : null}
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      width: "content",
      sortValue: (p) => p.type,
      cell: (p) => <span className="text-ink-600">{p.type}</span>,
    },
    {
      key: "funds",
      header: "Available funds",
      width: "content",
      align: "right",
      sortValue: (p) => p.availableFunds,
      cell: (p) => <span className="figure text-ink-900">{formatMoney(p.availableFunds)}</span>,
    },
    {
      key: "expected",
      header: "Monthly expenses",
      width: "content",
      align: "right",
      sortValue: (p) => p.expectedMonthlyExpenses,
      cell: (p) => <span className="figure text-ink-700">{formatMoney(p.expectedMonthlyExpenses)}</span>,
    },
    {
      key: "days",
      header: "Operating days",
      width: "content",
      align: "right",
      sortValue: (p) => p.operatingDays,
      cell: (p) => <span className="figure text-ink-600">{p.operatingDays}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      headerSrOnly: true,
      width: "content",
      align: "right",
      cell: (p) => (
        <div className="flex items-center justify-end gap-3">
          {p.id !== selected?.id ? (
            <button
              type="button"
              onClick={() => selectProfile(p.id)}
              className="tap-inline font-medium text-brand-700 transition hover:text-brand-800"
            >
              Switch to
              <span className="sr-only"> {p.name}</span>
            </button>
          ) : null}
          <Link
            to={`/business-profiles/${p.id}/edit`}
            className="tap-inline font-medium text-ink-500 transition hover:text-ink-900"
          >
            Edit
            <span className="sr-only"> {p.name}</span>
          </Link>
          <button
            type="button"
            onClick={() => handleArchive(p)}
            disabled={busyId === p.id}
            className="tap-inline font-medium text-ink-400 transition hover:text-tone-danger disabled:opacity-60"
          >
            {busyId === p.id ? "Archiving…" : "Archive"}
            <span className="sr-only"> {p.name}</span>
          </button>
        </div>
      ),
    },
  ];

  const toolbar = (
    <div className="relative min-w-0 sm:max-w-xs">
      <label htmlFor="biz-search" className="sr-only">
        Search businesses
      </label>
      <IconSearch
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
      />
      <TextInput
        id="biz-search"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="Search businesses…"
        className="pl-9 pr-3"
      />
    </div>
  );

  return (
    <div>
      <PageHead
        eyebrow="Management"
        title="Business profiles"
        subtitle="Every shop, branch, or income source you track separately."
        actions={
          <ButtonLink to="/business-profiles/new" variant="brand" size="sm">
            + Add another business
          </ButtonLink>
        }
      />

      {error ? (
        <p className="mb-4 rounded-xl bg-tint-danger px-3.5 py-3 text-sm text-tone-danger ring-1 ring-edge-danger">
          {error}
        </p>
      ) : null}

      <DataTable
        rows={filtered}
        columns={columns}
        getRowKey={(p) => String(p.id)}
        caption="Your business profiles"
        itemNoun="businesses"
        storageKey="businessProfiles"
        initialSort={{ key: "name", direction: "asc" }}
        toolbar={toolbar}
        empty={
          <EmptyState compact title="No businesses match that search" icon="⌕">
            Try a shorter word, or clear the search box.
          </EmptyState>
        }
        mobileRow={(p) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-900">{p.name}</p>
                <p className="text-xs text-ink-500">{p.type}</p>
              </div>
              {p.id === selected?.id ? <Pill tone="ok">Active</Pill> : null}
            </div>

            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Available funds</dt>
                <dd className="figure font-medium text-ink-900">{formatMoney(p.availableFunds)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Expected monthly expenses</dt>
                <dd className="figure font-medium text-ink-900">
                  {formatMoney(p.expectedMonthlyExpenses)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Operating days / month</dt>
                <dd className="figure font-medium text-ink-900">{p.operatingDays}</dd>
              </div>
            </dl>

            <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-paper-200 pt-2">
              {p.id !== selected?.id ? (
                <button
                  type="button"
                  onClick={() => selectProfile(p.id)}
                  className="tap rounded-lg px-3 text-sm font-medium text-brand-700 transition hover:bg-tint-brand"
                >
                  Switch to this
                </button>
              ) : null}
              <Link
                to={`/business-profiles/${p.id}/edit`}
                className="tap rounded-lg px-3 text-sm font-medium text-ink-500 transition hover:bg-paper-100"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={() => handleArchive(p)}
                disabled={busyId === p.id}
                className="tap ml-auto rounded-lg px-3 text-sm font-medium text-ink-400 transition hover:bg-paper-100 disabled:opacity-60"
              >
                {busyId === p.id ? "Archiving…" : "Archive"}
              </button>
            </div>
          </div>
        )}
      />

      {archivedPanel}
    </div>
  );
}
