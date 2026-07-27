import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { useExpenseCategories } from "../context/ExpenseCategoryContext";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { Money } from "../components/Money";
import { Button, ButtonLink } from "../components/Button";
import { AlertBadge } from "../components/Alert";
import { EmptyState } from "../components/EmptyState";
import { DataTable, type Column } from "../components/DataTable";
import { IconSearch } from "../components/icons";
import { RECORD_SOURCE_LABELS, type RecordItem, type RecordSource } from "../lib/types";
import { PageHead, Pill, Tag } from "../components/ui";
import { SelectInput, TextInput } from "../components/Field";

interface Filters {
  type: "all" | "expense" | "sales";
  categoryId: string;
  dateFrom: string;
  dateTo: string;
  keyword: string;
  source: "" | RecordSource;
}

const emptyFilters: Filters = {
  type: "all",
  categoryId: "",
  dateFrom: "",
  dateTo: "",
  keyword: "",
  source: "",
};

/** Which filters count as "advanced" for Hick's Law progressive disclosure. */
function activeAdvancedCount(f: Filters) {
  return [f.categoryId, f.dateFrom, f.dateTo, f.source].filter(Boolean).length;
}

export function Records() {
  const { selected } = useBusinessProfiles();
  const { categories } = useExpenseCategories();
  const [searchParams] = useSearchParams();

  // Seeded from the URL so a deep link can arrive pre-filtered — global search
  // sends "category X" here as ?type=expense&categoryId=N, and it would be a
  // dead end if the page ignored it.
  const [filters, setFilters] = useState<Filters>(() => ({
    ...emptyFilters,
    type: (searchParams.get("type") as Filters["type"]) || "all",
    categoryId: searchParams.get("categoryId") ?? "",
    keyword: searchParams.get("keyword") ?? "",
  }));

  // The initialiser above only runs on mount, and navigating from /records to
  // /records?categoryId=5 does not remount this component — same route. So a
  // search result picked while already on this page would change the URL and
  // nothing else. This applies the query string on every change instead.
  //
  // It deliberately resets the other filters rather than merging: arriving via
  // a link means "show me this", and silently keeping a date range from
  // earlier would quietly hide most of what the link promised.
  const queryKey = searchParams.toString();
  useEffect(() => {
    const type = searchParams.get("type") as Filters["type"] | null;
    const categoryId = searchParams.get("categoryId");
    const keyword = searchParams.get("keyword");
    if (!type && !categoryId && !keyword) return;

    setFilters({
      ...emptyFilters,
      type: type ?? "all",
      categoryId: categoryId ?? "",
      keyword: keyword ?? "",
    });
    // `queryKey` is the stable string form of searchParams; the object
    // identity changes on every render and would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flaggedCount, setFlaggedCount] = useState(0);
  // Hick's Law: the two filters people reach for most (type, search) stay
  // visible; the other four are collapsed until asked for. Auto-expanded when
  // any of them is already set, so an active filter is never hidden.
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function loadRecords() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<RecordItem[]>("/records/search", {
        params: {
          businessProfileId: selected.id,
          type: filters.type,
          categoryId: filters.categoryId || undefined,
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          keyword: filters.keyword || undefined,
          source: filters.source || undefined,
        },
      });
      setRecords(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadFlaggedCount() {
    if (!selected) return;
    const { data } = await api.get<RecordItem[]>("/records/flagged", {
      params: { businessProfileId: selected.id },
    });
    setFlaggedCount(data.length);
  }

  useEffect(() => {
    loadRecords();
    loadFlaggedCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, filters]);

  async function handleDelete(record: RecordItem) {
    if (!confirm(`Delete "${record.description}"? This can't be undone.`)) return;
    const path = record.type === "expense" ? `/records/expenses/${record.id}` : `/records/sales/${record.id}`;
    await api.delete(path);
    await Promise.all([loadRecords(), loadFlaggedCount()]);
  }

  function categoryName(categoryId?: number) {
    return categories.find((c) => c.id === categoryId)?.name ?? "—";
  }

  if (!selected) return null;

  const hasFilters = JSON.stringify(filters) !== JSON.stringify(emptyFilters);
  const advancedCount = activeAdvancedCount(filters);

  /** Status badges, shared between the table row and the mobile card. */
  const statusBadges = (r: RecordItem) => (
    <div className="flex flex-wrap gap-1">
      {r.duplicateStatus === "Flagged" ? <AlertBadge kind="duplicate" /> : null}
      {r.reviewStatus === "Needs Review" ? <AlertBadge kind="needs-review" /> : null}
      {r.largeExpenseFlag ? <AlertBadge kind="large-expense" /> : null}
    </div>
  );

  const editPath = (r: RecordItem) =>
    r.type === "expense" ? `/records/expenses/${r.id}/edit` : `/records/sales/${r.id}/edit`;

  // ---------------------------------------------------------------
  // Columns
  // ---------------------------------------------------------------
  // Every column except Description is "content" width — dates, amounts,
  // sources and status chips all have a known maximum size, so they shrink to
  // fit and Description absorbs everything left over. That is what gives
  // Description the room it needs at any window width without a hard-coded
  // percentage that would be wrong at some other width.
  const columns: Column<RecordItem>[] = [
    {
      key: "date",
      header: "Date",
      width: "content",
      sortValue: (r) => r.date,
      cell: (r) => <span className="figure text-ink-600">{r.date.slice(0, 10)}</span>,
    },
    {
      key: "description",
      header: "Description",
      width: "grow",
      sortValue: (r) => r.description,
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 font-medium text-ink-900">{r.description}</span>
          <Tag kind={r.type === "expense" ? "expense" : "sales"} />
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      width: "content",
      sortValue: (r) => (r.type === "expense" ? categoryName(r.categoryId) : null),
      cell: (r) => (
        <span className="text-ink-600">{r.type === "expense" ? categoryName(r.categoryId) : "—"}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      width: "content",
      align: "right",
      sortValue: (r) => r.amount,
      cell: (r) => (
        <span className={`font-medium ${r.type === "expense" ? "text-ink-900" : "text-brand-700"}`}>
          <Money value={r.amount} />
        </span>
      ),
    },
    {
      key: "source",
      header: "Source",
      width: "content",
      sortValue: (r) => r.source,
      cell: (r) => (
        <span className="text-xs text-ink-500">
          {RECORD_SOURCE_LABELS[r.source as RecordSource] ?? r.source}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "content",
      cell: (r) => statusBadges(r),
    },
    {
      key: "actions",
      header: "Actions",
      headerSrOnly: true,
      width: "content",
      align: "right",
      cell: (r) => (
        <div className="flex items-center justify-end gap-3">
          <Link
            to={editPath(r)}
            className="tap-inline font-medium text-brand-700 transition hover:text-brand-800"
          >
            Edit
            <span className="sr-only"> {r.description}</span>
          </Link>
          <button
            type="button"
            onClick={() => handleDelete(r)}
            className="tap-inline font-medium text-ink-400 transition hover:text-rose-600"
          >
            Delete
            <span className="sr-only"> {r.description}</span>
          </button>
        </div>
      ),
    },
  ];

  // ---------------------------------------------------------------
  // Filters, rendered inside the table's own header bar
  // ---------------------------------------------------------------
  // Previously a separate floating card above the table. Folding them in
  // means the search box, the filters, the column headers and the rows all
  // share one border and one left edge, so the eye follows a single column
  // down the page instead of stepping across three stacked boxes.
  const toolbar = (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-64">
          <label htmlFor="rec-search" className="mb-1 block text-xs font-medium text-ink-500">
            Search
          </label>
          <IconSearch
            aria-hidden
            className="pointer-events-none absolute left-3 top-[2.1rem] h-4 w-4 text-ink-400"
          />
          <TextInput
            id="rec-search"
            value={filters.keyword}
            onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))}
            placeholder="Description contains…"
            className="pl-9 pr-3"
          />
        </div>

        <div>
          <label htmlFor="rec-type" className="mb-1 block text-xs font-medium text-ink-500">
            Type
          </label>
          <SelectInput
            id="rec-type"
            value={filters.type}
            onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as Filters["type"] }))}
            className="w-auto px-2"
          >
            <option value="all">All</option>
            <option value="expense">Expense</option>
            <option value="sales">Sales</option>
          </SelectInput>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
          className="tap rounded-lg px-3 text-sm font-medium text-tone-brand transition hover:bg-tint-brand"
        >
          {showAdvanced ? "Fewer filters" : "More filters"}
          {advancedCount > 0 && !showAdvanced ? (
            <span className="ml-1.5 rounded-full bg-brand-600 px-1.5 text-xs text-white">
              {advancedCount}
            </span>
          ) : null}
        </button>

        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={() => setFilters(emptyFilters)}>
            Clear filters
          </Button>
        ) : null}
      </div>

      {showAdvanced || advancedCount > 0 ? (
        <div className="mt-3 grid animate-slide-up gap-3 border-t border-paper-200 pt-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="rec-cat" className="mb-1 block text-xs font-medium text-ink-500">
              Category
            </label>
            <SelectInput
              id="rec-cat"
              value={filters.categoryId}
              onChange={(e) => setFilters((f) => ({ ...f, categoryId: e.target.value }))}
              disabled={filters.type === "sales"}
              className="px-2 disabled:bg-paper-100 disabled:text-ink-400"
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectInput>
          </div>
          <div>
            <label htmlFor="rec-src" className="mb-1 block text-xs font-medium text-ink-500">
              Source
            </label>
            <SelectInput
              id="rec-src"
              value={filters.source}
              onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value as Filters["source"] }))}
              className="px-2"
            >
              <option value="">All sources</option>
              {(Object.keys(RECORD_SOURCE_LABELS) as RecordSource[]).map((s) => (
                <option key={s} value={s}>
                  {RECORD_SOURCE_LABELS[s]}
                </option>
              ))}
            </SelectInput>
          </div>
          <div>
            <label htmlFor="rec-from" className="mb-1 block text-xs font-medium text-ink-500">
              From
            </label>
            <TextInput
              id="rec-from"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              className="px-2"
            />
          </div>
          <div>
            <label htmlFor="rec-to" className="mb-1 block text-xs font-medium text-ink-500">
              To
            </label>
            <TextInput
              id="rec-to"
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              className="px-2"
            />
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div>
      <PageHead
        eyebrow="Records management"
        title="Records"
        subtitle="Store, organise, and review every expense and sales reference record."
        actions={
          <>
            {flaggedCount > 0 ? (
              <Link
                to="/records/flagged"
                className="tap gap-2 rounded-xl border border-edge-accent bg-tint-accent px-3 text-sm font-semibold text-tone-accent transition hover:brightness-95"
              >
                Review flagged
                <Pill tone="warn">{flaggedCount}</Pill>
              </Link>
            ) : null}
            <ButtonLink to="/records/expenses/new" variant="brand" size="sm">
              + Add expense
            </ButtonLink>
          </>
        }
      />

      {/* The less-used create paths. Scrolls horizontally on phones rather
          than wrapping into rows that push the table off-screen. */}
      <div className="scroll-slim -mx-4 mb-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <div className="flex w-max gap-2">
          <ButtonLink to="/records/sales/new" variant="secondary" size="sm">
            + Add sales
          </ButtonLink>
          <ButtonLink to="/records/receipts/new" variant="secondary" size="sm">
            Scan receipt
          </ButtonLink>
          <ButtonLink to="/records/csv-imports/new" variant="secondary" size="sm">
            Import CSV
          </ButtonLink>
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-xl bg-tint-danger px-3.5 py-3 text-sm text-tone-danger ring-1 ring-edge-danger">
          {error}
        </p>
      ) : null}

      <DataTable
        rows={records}
        columns={columns}
        getRowKey={(r) => `${r.type}-${r.id}`}
        loading={loading}
        caption={`Expense and sales reference records for ${selected.name}`}
        itemNoun="records"
        storageKey="records"
        initialSort={{ key: "date", direction: "desc" }}
        toolbar={toolbar}
        empty={
          hasFilters ? (
            <EmptyState compact title="No records match these filters" icon="⌕">
              Try widening the date range or clearing the search box.
            </EmptyState>
          ) : (
            <EmptyState
              compact
              title="You haven't added any records yet"
              action={
                <>
                  <ButtonLink to="/records/expenses/new" variant="primary">
                    Add your first expense
                  </ButtonLink>
                  <ButtonLink to="/records/receipts/new" variant="secondary">
                    Or scan a receipt
                  </ButtonLink>
                </>
              }
            >
              Start with what you spent today — even one entry is enough for FinSight to begin showing
              you something.
            </EmptyState>
          )
        }
        mobileRow={(r) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-900">{r.description}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                  <span className="figure">{r.date.slice(0, 10)}</span>
                  <span aria-hidden>·</span>
                  <Tag kind={r.type === "expense" ? "expense" : "sales"} />
                  {r.type === "expense" ? <span>· {categoryName(r.categoryId)}</span> : null}
                </p>
              </div>
              <p
                className={`shrink-0 text-right font-medium ${
                  r.type === "expense" ? "text-ink-900" : "text-brand-700"
                }`}
              >
                <Money value={r.amount} />
              </p>
            </div>

            <div className="mt-2">{statusBadges(r)}</div>

            <div className="mt-3 flex items-center justify-between border-t border-paper-200 pt-2">
              <span className="text-xs text-ink-400">
                {RECORD_SOURCE_LABELS[r.source as RecordSource] ?? r.source}
              </span>
              <div className="flex gap-1">
                <Link
                  to={editPath(r)}
                  className="tap rounded-lg px-3 text-sm font-medium text-tone-brand transition hover:bg-tint-brand"
                >
                  Edit
                  <span className="sr-only"> {r.description}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(r)}
                  className="tap rounded-lg px-3 text-sm font-medium text-ink-400 transition hover:bg-tint-danger hover:text-tone-danger"
                >
                  Delete
                  <span className="sr-only"> {r.description}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      />
    </div>
  );
}
