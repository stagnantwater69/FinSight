import { useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { todayIso } from "../lib/dates";
import { countFor, exportRequest, MAX_EXPORT_ROWS, presetMonths, type ExportMode, type ExportMonth, type ExportType } from "../lib/exportChoice";
import { Button } from "./Button";
import { Checkbox } from "./Field";
import { Modal } from "./Modal";
import { useToast } from "./Toast";

type Params = Record<string, string | number>;

/** Remembered in this browser so a monthly hand-off is two clicks. */
const REMEMBER_KEY = "finsight.exportChoice";

const QUICK: { mode: ExportMode; label: string }[] = [
  { mode: "thisMonth", label: "This month" },
  { mode: "lastMonth", label: "Last month" },
  { mode: "thisQuarter", label: "This quarter" },
  { mode: "thisYear", label: "This year" },
  { mode: "lastYear", label: "Last year" },
  { mode: "months", label: "Pick months" },
  { mode: "range", label: "Date range" },
  { mode: "everything", label: "Everything" },
];

const TYPES: { value: ExportType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "expense", label: "Expenses" },
  { value: "sales", label: "Sales" },
];

const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-PH", { month: "long", timeZone: "UTC" });

function readRemembered(): { type?: ExportType; mode?: ExportMode; months?: string[] } {
  try {
    return JSON.parse(localStorage.getItem(REMEMBER_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-tap rounded-full border px-3.5 text-sm font-medium transition ${FOCUS} ${
        selected ? "border-edge-brand bg-tint-brand text-tone-brand" : "border-paper-200 bg-paper text-ink-700 hover:bg-paper-100"
      }`}
    >
      {label}
    </button>
  );
}

/** One choice in the Period grid: a name, and what it covers underneath. */
function OptionTile({ label, detail, selected, onClick, wide = false }: {
  label: string;
  detail: string;
  selected: boolean;
  onClick: () => void;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${label}, ${detail}`}
      onClick={onClick}
      className={`relative flex min-h-[3.5rem] flex-col justify-center rounded-xl border px-3.5 py-2.5 text-left transition ${FOCUS} ${wide ? "col-span-full" : ""} ${
        selected ? "border-edge-brand bg-tint-brand" : "border-paper-200 bg-paper hover:bg-paper-100"
      }`}
    >
      <span className={`pr-6 text-sm font-semibold ${selected ? "text-tone-brand" : "text-ink-800"}`}>{label}</span>
      <span className="mt-0.5 text-xs text-ink-500">{detail}</span>
      {selected ? (
        <svg aria-hidden viewBox="0 0 20 20" className="absolute right-3 top-3 h-4 w-4 text-tone-brand" fill="currentColor">
          <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
        </svg>
      ) : null}
    </button>
  );
}

const shortMonth = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", timeZone: "UTC" });

/** "Nov 2026", "Oct – Nov 2026", "Dec 2025 – Jan 2026". */
function spanLabel(months: readonly string[]): string {
  if (months.length === 0) return "";
  const sorted = [...months].sort();
  const first = sorted[0]!, last = sorted.at(-1)!;
  if (first === last) return `${shortMonth(first)} ${first.slice(0, 4)}`;
  return first.slice(0, 4) === last.slice(0, 4)
    ? `${shortMonth(first)} – ${shortMonth(last)} ${last.slice(0, 4)}`
    : `${shortMonth(first)} ${first.slice(0, 4)} – ${shortMonth(last)} ${last.slice(0, 4)}`;
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

async function download(params: Params, name?: string) {
  const res = await api.get<Blob>("/records/export", { params, responseType: "blob" });
  const fromServer = /filename="([^"]+)"/.exec(String(res.headers["content-disposition"] ?? ""))?.[1];
  const url = URL.createObjectURL(res.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = name ? `${name}.csv` : fromServer ?? "finsight-records.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Downloads records as a CSV for an accountant. The button opens a panel:
 * the kind of record, then a quick pick, months ticked one by one (grouped by
 * year), a date range, everything, or the Records page's own filters when any
 * are on. The button inside says how many records that is before anything is
 * downloaded, from the per-month counts at /records/export/months.
 */
export function ExportCsvButton({
  businessProfileId,
  timeZone,
  filteredParams,
}: {
  businessProfileId: number;
  timeZone?: string;
  /** The page's applied filters (with the business id), when any are on; offered as "As filtered". */
  filteredParams: Params | null;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remembered = useMemo(readRemembered, []);
  const [type, setType] = useState<ExportType>(remembered.type ?? "all");
  const [mode, setMode] = useState<ExportMode>(remembered.mode && remembered.mode !== "filtered" ? remembered.mode : "thisMonth");
  const [picked, setPicked] = useState<string[]>(Array.isArray(remembered.months) ? remembered.months : []);
  const [year, setYear] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [counts, setCounts] = useState<ExportMonth[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const today = todayIso(timeZone);

  // Opening with filters on starts on "As filtered": that is what the owner is looking at.
  function openPanel() {
    if (filteredParams) setMode("filtered");
    else if (mode === "filtered") setMode("thisMonth");
    setError(null);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoadError(null);
    api.get<{ months: ExportMonth[] }>("/records/export/months", { params: { businessProfileId } })
      .then((res) => { if (live) setCounts(res.data.months); })
      .catch((err) => { if (live) setLoadError(`Couldn't load your months. ${getErrorMessage(err)}`); });
    return () => { live = false; };
  }, [open, businessProfileId]);

  const years = useMemo(() => [...new Set((counts ?? []).map((row) => row.month.slice(0, 4)))], [counts]);
  const shownYear = year && years.includes(year) ? year : years[0] ?? null;
  const available = new Set((counts ?? []).map((row) => row.month));
  const chosenMonths = mode === "months" ? picked.filter((month) => available.has(month)) : presetMonths(mode, today);
  const rangeReady = mode === "range" && dateFrom !== "" && dateTo !== "" && dateFrom <= dateTo;

  const count = !counts || mode === "filtered" || mode === "range" ? null : countFor(counts, mode === "everything" ? null : chosenMonths ?? [], type);
  const tooMany = count !== null && count > MAX_EXPORT_ROWS;
  const ready = !busy && (mode === "filtered" ? filteredParams !== null
    : mode === "range" ? rangeReady
      : count !== null && count > 0 && !tooMany);

  const monthsLabel = chosenMonths && mode !== "everything" ? `${chosenMonths.length} month${chosenMonths.length === 1 ? "" : "s"} · ` : "";
  const buttonLabel = busy ? "Exporting…"
    : mode === "filtered" ? "Export as filtered"
      : mode === "range" ? (rangeReady ? "Export this range" : "Choose both dates")
        : count === null ? "Counting…"
          : count === 0 ? (mode === "months" && chosenMonths?.length === 0 ? "Pick at least one month" : "No records in this period")
            : tooMany ? "Too many for one file"
              : `Export ${monthsLabel}${count.toLocaleString("en-PH")} record${count === 1 ? "" : "s"}`;

  function detailFor(option: ExportMode): string {
    switch (option) {
      case "filtered": return "The search, type and filters on this page";
      case "months": return chosenMonths && mode === "months" && chosenMonths.length > 0 ? spanLabel(chosenMonths) : "Tick any months";
      case "range": return dateFrom && dateTo && mode === "range" ? `${shortDate(dateFrom)} – ${shortDate(dateTo)}` : "Choose start and end";
      case "everything": return "Every record you have";
      default: return spanLabel(presetMonths(option, today) ?? []);
    }
  }

  const yearMonths = (counts ?? []).filter((row) => row.month.startsWith(shownYear ?? "~"));
  const wholeYear = yearMonths.length > 0 && yearMonths.every((row) => picked.includes(row.month));
  const toggleMonth = (month: string, on: boolean) =>
    setPicked((current) => (on ? [...new Set([...current, month])] : current.filter((m) => m !== month)));

  async function submit() {
    if (!ready) return;
    try {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({ type, mode, months: picked }));
    } catch {
      // Private browsing or blocked storage: the choice just isn't remembered.
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "filtered" && filteredParams) {
        await download(filteredParams);
      } else {
        const scope = mode === "everything" ? null : mode === "range" ? { dateFrom, dateTo } : { months: chosenMonths ?? [] };
        const { query, name } = exportRequest(businessProfileId, type, scope);
        await download(query, name);
      }
      setOpen(false);
      toast("Your file is ready");
    } catch (err) {
      // A blob request gets its JSON error body back as a Blob too.
      if (isAxiosError(err) && err.response?.data instanceof Blob) {
        try {
          err.response.data = JSON.parse(await err.response.data.text());
        } catch {
          // Not JSON; getErrorMessage falls back to its generic wording.
        }
      }
      setError(`Couldn't export. ${getErrorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={openPanel}>
        Export CSV
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Export records">
        <div className="space-y-5">
          {loadError ? <p role="alert" className="text-sm text-tone-danger">{loadError}</p> : null}

          {mode !== "filtered" ? (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink-800">Records</legend>
              <div role="radiogroup" aria-label="Records to export" className="flex gap-1 rounded-xl bg-paper-100 p-1">
                {TYPES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={type === option.value}
                    onClick={() => setType(option.value)}
                    className={`flex min-h-tap flex-1 items-center justify-center rounded-lg px-2 text-sm font-semibold transition ${
                      type === option.value ? "bg-paper text-tone-brand shadow-sm" : "text-ink-500 hover:text-ink-800"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink-800">Period</legend>
            <div role="radiogroup" aria-label="Period" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filteredParams ? (
                <OptionTile wide label="As filtered" detail={detailFor("filtered")} selected={mode === "filtered"} onClick={() => setMode("filtered")} />
              ) : null}
              {QUICK.map((option) => (
                <OptionTile key={option.mode} label={option.label} detail={detailFor(option.mode)} selected={mode === option.mode} onClick={() => setMode(option.mode)} />
              ))}
            </div>
          </fieldset>

          {mode === "months" ? (
            counts === null ? (
              <p role="status" className="text-sm text-ink-500">Loading your months…</p>
            ) : counts.length === 0 ? (
              <p className="text-sm text-ink-500">No records yet.</p>
            ) : (
              <div className="space-y-2">
                {years.length > 1 ? (
                  <div className="flex flex-wrap gap-2" aria-label="Year">
                    {years.map((y) => <Chip key={y} label={y} selected={y === shownYear} onClick={() => setYear(y)} />)}
                  </div>
                ) : null}
                <Checkbox
                  label={`Whole of ${shownYear}`}
                  checked={wholeYear}
                  onChange={(on) => setPicked((current) => (on
                    ? [...new Set([...current, ...yearMonths.map((row) => row.month)])]
                    : current.filter((month) => !month.startsWith(shownYear ?? "~"))))}
                />
                <ul className="max-h-64 divide-y divide-paper-200 overflow-y-auto rounded-xl border border-paper-200 px-3">
                  {yearMonths.map((row) => {
                    const n = countFor([row], null, type);
                    return (
                      <li key={row.month} className="py-1">
                        <Checkbox
                          label={`${monthName(row.month)} ${row.month.slice(0, 4)}`}
                          hint={`${n.toLocaleString("en-PH")} record${n === 1 ? "" : "s"}`}
                          checked={picked.includes(row.month)}
                          onChange={(on) => toggleMonth(row.month, on)}
                        />
                      </li>
                    );
                  })}
                </ul>
                {picked.length > 0 ? (
                  <button type="button" onClick={() => setPicked([])} className="min-h-tap text-sm font-semibold text-tone-brand hover:underline">
                    {`Clear ${picked.length} picked`}
                  </button>
                ) : null}
              </div>
            )
          ) : null}

          {mode === "range" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-ink-700">
                From
                <input type="date" value={dateFrom} max={today} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 block min-h-tap w-full rounded-lg border border-paper-200 bg-paper px-3 text-ink-800" />
              </label>
              <label className="block text-sm font-medium text-ink-700">
                To
                <input type="date" value={dateTo} max={today} onChange={(e) => setDateTo(e.target.value)} className="mt-1 block min-h-tap w-full rounded-lg border border-paper-200 bg-paper px-3 text-ink-800" />
              </label>
              {dateFrom && dateTo && dateFrom > dateTo ? (
                <p className="text-xs text-tone-danger sm:col-span-2">The start date is after the end date.</p>
              ) : null}
            </div>
          ) : null}

          {tooMany ? (
            <p className="text-xs text-tone-danger">{`A spreadsheet holds up to ${MAX_EXPORT_ROWS.toLocaleString("en-PH")} rows. Pick fewer months.`}</p>
          ) : null}
          {error ? <p role="alert" className="text-sm text-tone-danger">{error}</p> : null}

          <div className="sticky -bottom-5 -mx-5 -mb-5 flex flex-wrap items-center gap-3 border-t border-paper-200 bg-paper-50 px-5 py-4">
            <p className="min-w-0 flex-1 text-sm text-ink-600" aria-live="polite">
              <span className="font-semibold text-ink-800">{mode === "filtered" ? "Filtered records" : `${TYPES.find((option) => option.value === type)?.label} records`}</span>
              {` · ${detailFor(mode)}`}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="button" variant="primary" disabled={!ready} onClick={() => void submit()}>{buttonLabel}</Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
