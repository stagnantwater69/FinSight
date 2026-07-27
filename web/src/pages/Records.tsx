import { useEffect, useRef, useState } from "react";
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
import { useConfirm } from "../components/ConfirmDialog";
import { useDebounced } from "../lib/hooks";
import { useToast } from "../components/Toast";

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

/**
 * The filter <-> URL mapping, in one pair of functions so the two directions
 * cannot drift.
 *
 * Only non-default values are written, so an unfiltered /records stays a clean
 * URL rather than carrying six empty parameters.
 */
function filtersToParams(f: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.type !== "all") params.set("type", f.type);
  if (f.categoryId) params.set("categoryId", f.categoryId);
  if (f.keyword) params.set("keyword", f.keyword);
  if (f.dateFrom) params.set("dateFrom", f.dateFrom);
  if (f.dateTo) params.set("dateTo", f.dateTo);
  if (f.source) params.set("source", f.source);
  return params;
}

function filtersFromParams(params: URLSearchParams): Filters {
  return {
    type: (params.get("type") as Filters["type"]) || "all",
    categoryId: params.get("categoryId") ?? "",
    keyword: params.get("keyword") ?? "",
    dateFrom: params.get("dateFrom") ?? "",
    dateTo: params.get("dateTo") ?? "",
    source: (params.get("source") as Filters["source"]) ?? "",
  };
}

export function Records() {
  const { selected } = useBusinessProfiles();
  const { categories } = useExpenseCategories();
  const [searchParams, setSearchParams] = useSearchParams();
  const confirm = useConfirm();
  const toast = useToast();

  // Seeded from the URL so a deep link can arrive pre-filtered — global search
  // sends "category X" here as ?type=expense&categoryId=N, and it would be a
  // dead end if the page ignored it.
  const [filters, setFilters] = useState<Filters>(() => filtersFromParams(searchParams));

  /**
   * The search box is debounced; the selects are not.
   *
   * Typing fired one /records/search AND one /records/flagged per keystroke,
   * because the fetch effect depended on the whole `filters` object and its
   * identity changes on every setFilters. Choosing from a dropdown is a single
   * deliberate act and should feel immediate, so only the keyword waits.
   */
  const debouncedKeyword = useDebounced(filters.keyword, 250);

  // What the URL should say, given the filters that have actually been applied.
  // The debounced keyword rather than the raw one, so a burst of typing writes
  // one entry instead of one per character.
  const appliedFilters: Filters = { ...filters, keyword: debouncedKeyword };
  const desiredQuery = filtersToParams(appliedFilters).toString();
  const queryKey = searchParams.toString();

  /**
   * Filters -> URL, so a filtered view can be bookmarked, shared and restored
   * with the back button. The page read filters FROM the URL already but never
   * wrote any back, so the address bar went stale the moment anything changed.
   *
   * `replace` because adjusting a filter is refining one view, not navigating
   * to a new one — otherwise Back would step through every intermediate state.
   */
  const lastWritten = useRef<string | null>(null);
  const keywordSettled = debouncedKeyword === filters.keyword;

  useEffect(() => {
    // Wait for the debounce to catch up before touching the URL. This does two
    // jobs. While typing it holds the write until the keyword stops changing,
    // so a burst of characters produces one history entry. More importantly it
    // keeps the Back button working: when the read effect below applies a URL
    // the user navigated to, `filters` updates immediately but
    // `debouncedKeyword` still holds the PREVIOUS keyword for another 250ms —
    // without this guard the stale value would be written straight back and
    // Back would look broken.
    if (!keywordSettled) return;
    if (desiredQuery === queryKey) return;
    lastWritten.current = desiredQuery;
    setSearchParams(desiredQuery, { replace: true });
  }, [desiredQuery, queryKey, keywordSettled, setSearchParams]);

  /**
   * URL -> filters, for navigation this page didn't cause: global search while
   * already on /records, a pasted link, the back button.
   *
   * The ref is what stops the two effects looping. A query string this
   * component just wrote is not new information, so it is ignored; anything
   * else is an actual navigation and gets applied.
   */
  useEffect(() => {
    if (queryKey === lastWritten.current) return;
    setFilters(filtersFromParams(new URLSearchParams(queryKey)));
  }, [queryKey]);

  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flaggedCount, setFlaggedCount] = useState(0);
  // Hick's Law: the two filters people reach for most (type, search) stay
  // visible; the other four are collapsed until asked for. Auto-expanded when
  // any of them is already set, so an active filter is never hidden.
  const [showAdvanced, setShowAdvanced] = useState(false);

  /**
   * SCALE CEILING, deliberate: /records/search returns the whole result set and
   * DataTable paginates it in the browser. That is fine at a few hundred
   * records and wrong at several thousand.
   *
   * It is not fixable from here. The endpoint merges the expense and sales
   * tables and sorts the combined array in Node (records.controller.ts), so
   * page N of the merged stream is not page N of either table — adding
   * skip/take to the two findMany calls would return the wrong rows, not a
   * slower version of the right ones. Real server-side paging needs a UNION
   * query or a keyset over the combined set, which is a backend change and out
   * of scope for this pass.
   */
  async function loadRecords(signal?: AbortSignal) {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<RecordItem[]>("/records/search", {
        signal,
        params: {
          businessProfileId: selected.id,
          type: appliedFilters.type,
          categoryId: appliedFilters.categoryId || undefined,
          dateFrom: appliedFilters.dateFrom || undefined,
          dateTo: appliedFilters.dateTo || undefined,
          keyword: appliedFilters.keyword || undefined,
          source: appliedFilters.source || undefined,
        },
      });
      setRecords(data);
    } catch (err) {
      // A superseded request is not a failure — reporting it would flash an
      // error every time the filters change faster than the network.
      if (signal?.aborted) return;
      setError(getErrorMessage(err));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  async function loadFlaggedCount(signal?: AbortSignal) {
    if (!selected) return;
    try {
      const { data } = await api.get<RecordItem[]>("/records/flagged", {
        signal,
        params: { businessProfileId: selected.id },
      });
      setFlaggedCount(data.length);
    } catch {
      // The badge is decoration; a failure here must not take out the page.
    }
  }

  // Depends on the individual filter values rather than the `filters` object,
  // whose identity changes on every keystroke — that identity was the reason a
  // single character re-issued both requests.
  useEffect(() => {
    const controller = new AbortController();
    loadRecords(controller.signal);
    loadFlaggedCount(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selected?.id,
    appliedFilters.type,
    appliedFilters.categoryId,
    appliedFilters.dateFrom,
    appliedFilters.dateTo,
    appliedFilters.keyword,
    appliedFilters.source,
  ]);

  /**
   * Delete, with the row removed optimistically and an undo offered.
   *
   * The optimistic removal is what makes the table feel like it responded; the
   * undo is what makes the removal safe to be that eager. Restoring re-POSTs
   * the record rather than un-deleting it, because the API has no soft delete —
   * so the restored row is a new record with a new id, which is why the list is
   * reloaded from the server afterwards rather than patched back in memory.
   */
  async function handleDelete(record: RecordItem) {
    const ok = await confirm({
      title: `Delete "${record.description}"?`,
      body: (
        <>
          This removes the record from your history. You'll get a moment to undo it, but after that it's
          gone.
        </>
      ),
      confirmLabel: "Delete record",
      tone: "danger",
    });
    if (!ok) return;

    const path = record.type === "expense" ? `/records/expenses/${record.id}` : `/records/sales/${record.id}`;
    const key = `${record.type}-${record.id}`;
    const previous = records;

    setRecords((rows) => rows.filter((r) => `${r.type}-${r.id}` !== key));

    try {
      await api.delete(path);
      loadFlaggedCount();
      toast("Record deleted", { actionLabel: "Undo", onAction: () => restoreRecord(record) });
    } catch (err) {
      // Put the row back: the server still has it, so leaving it hidden would
      // be lying about the state of their records.
      setRecords(previous);
      setError(getErrorMessage(err));
    }
  }

  async function restoreRecord(record: RecordItem) {
    try {
      if (record.type === "expense") {
        await api.post("/records/expenses", {
          businessProfileId: record.businessProfileId,
          categoryId: record.categoryId,
          date: record.date.slice(0, 10),
          description: record.description,
          vendor: record.vendor || undefined,
          amount: record.amount,
        });
      } else {
        await api.post("/records/sales", {
          businessProfileId: record.businessProfileId,
          date: record.date.slice(0, 10),
          description: record.description,
          amount: record.amount,
        });
      }
      await Promise.all([loadRecords(), loadFlaggedCount()]);
      toast("Record restored");
    } catch (err) {
      setError(getErrorMessage(err));
    }
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
