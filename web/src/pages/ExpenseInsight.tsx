import { useEffect, useMemo, useState } from "react";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { ExplainButton } from "../components/ExplainButton";
import { AskFinSightButton, AskFinSightDrawer } from "../components/AskFinSightDrawer";
import { DonutChart } from "../components/DonutChart";
import { CategoryComparisonChart } from "../components/CategoryComparisonChart";
import { DailySpendChart } from "../components/DailySpendChart";
import { SkeletonPanel, SkeletonStatTile } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { ButtonLink } from "../components/Button";
import { formatMoney } from "../components/Money";
import { STATUS_INK } from "../lib/chartPalette";
import { KpiCard, PageHead, Panel, Callout } from "../components/ui";
import type { ExpenseBehavior as ExpenseInsightData } from "../lib/types";

const PERIOD_OPTIONS = [
  { label: "This week", days: 7 },
  { label: "This month", days: 30 },
];

/**
 * Expense Insight.
 *
 * The audience is a small-business owner, not an accountant. So every panel
 * here answers a plain question in the order someone actually asks it:
 *
 *   1. How much did I spend, and is that a lot?      — the KPI row
 *   2. Where did it go?                              — Category distribution
 *   3. What changed since last time?                 — Category comparison
 *   4. When did it leave?                            — Daily spending
 *   5. Anything odd I should look at?                — Unusual expenses
 *   6. The numbers, exactly                          — Category summary table
 *
 * No panel assumes a term the reader might not have. "Exp. of available funds"
 * is written out as a share of the cash they told us they have; "biggest
 * increase" is a peso figure before it is a percentage.
 *
 * Every share percentage on this screen divides by the SAME server-computed
 * `totals.current`. That sounds obvious and is exactly what mixed-denominator
 * dashboards get wrong — a donut saying 59.6% beside a table saying 45.7% for
 * the same category destroys trust in every other number on the page.
 */

function buildContext(data: ExpenseInsightData, businessName: string, periodDays: number): string {
  const lines = [
    `Business: ${businessName}`,
    `Period: last ${periodDays} days (${data.periodStart.slice(0, 10)} to ${data.periodEnd.slice(0, 10)})`,
    `Total expenses this period: PHP ${data.totals.current.toLocaleString()}`,
    `Total expenses previous period: PHP ${data.totals.previous.toLocaleString()}`,
    "",
  ];

  lines.push("Category trends (this period vs. previous equivalent period):");
  if (data.categoryTrends.length === 0) {
    lines.push("- none — no expense categories or records exist yet.");
  } else {
    for (const t of data.categoryTrends) {
      const changeText =
        t.percentChange === null
          ? "new spending this period, no prior period to compare"
          : `${t.direction} ${Math.abs(t.percentChange).toFixed(1)}%`;
      lines.push(
        `- ${t.categoryName}: PHP ${t.current.toLocaleString()} across ${t.recordCount} record(s) (was PHP ${t.previous.toLocaleString()}, ${changeText})`,
      );
    }
  }

  lines.push("", "Unusual expenses flagged this period (Z-score beyond threshold vs. category history):");
  if (data.unusualExpenses.length === 0) {
    lines.push("- none flagged.");
  } else {
    for (const u of data.unusualExpenses) {
      lines.push(
        `- "${u.description}" PHP ${u.amount.toLocaleString()} on ${u.date.slice(0, 10)}, category ${u.categoryName} (z-score ${u.zScore.toFixed(2)}, category average PHP ${u.categoryMean.toFixed(2)})`,
      );
    }
  }

  if (data.insufficientHistoryCategories.length > 0) {
    lines.push(
      "",
      "Categories with too little history for unusual-expense detection: " +
        data.insufficientHistoryCategories
          .map((c) => `${c.categoryName} (${c.historyCount} record${c.historyCount === 1 ? "" : "s"})`)
          .join(", "),
    );
  }

  return lines.join("\n");
}

/** "▲ PHP 7,000" in the right status colour, or an em-dash for no movement. */
function ChangeFigure({ change, percent }: { change: number; percent: number | null }) {
  if (change === 0) {
    return <span className="figure text-ink-400">{formatMoney(0)}</span>;
  }
  const up = change > 0;
  return (
    // Spending MORE is the serious direction here, not the good one — this is
    // an expense screen, so up is bad. Colour is never the only signal: the
    // arrow and the sign say the same thing.
    <span className="figure font-semibold" style={{ color: up ? STATUS_INK.serious : STATUS_INK.good }}>
      <span aria-hidden>{up ? "▲" : "▼"}</span> {up ? "+" : "−"}
      {formatMoney(Math.abs(change))}
      {percent !== null && percent !== 0 ? (
        <span className="ml-1 text-[11px] font-medium opacity-80">
          {Math.abs(percent).toFixed(0)}%
        </span>
      ) : null}
    </span>
  );
}

export function ExpenseInsight() {
  const { selected } = useBusinessProfiles();
  const [periodDays, setPeriodDays] = useState(30);
  const [data, setData] = useState<ExpenseInsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function load() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<ExpenseInsightData>("/insights/expense-behavior", {
        params: { businessProfileId: selected.id, periodDays },
      });
      setData(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, periodDays]);

  // A refetch with data already on screen is a refresh, not a load — see the
  // note on the skeleton below.
  const isInitialLoad = loading && !data;
  const isRefreshing = loading && !!data;

  const periodLabel = periodDays === 7 ? "this week" : "this month";
  const previousLabel = periodDays === 7 ? "Last week" : "Last month";

  // ---- headline figures, all from one denominator ----
  const summary = useMemo(() => {
    if (!data) return null;
    const total = data.totals.current;
    const spending = data.categoryTrends.filter((t) => t.current > 0);
    const top = spending[0] ?? null; // already sorted by current, descending

    // Biggest increase by PESO movement, not by percentage — a 300% rise on a
    // PHP 200 category is noise, and percentage ranking puts it first.
    const risen = [...data.categoryTrends].filter((t) => t.change > 0).sort((a, b) => b.change - a.change);

    const periodDelta = total - data.totals.previous;
    const periodPercent =
      data.totals.previous > 0 ? (periodDelta / data.totals.previous) * 100 : null;

    return {
      total,
      categoryCount: spending.length,
      top,
      topShare: top && total > 0 ? (top.current / total) * 100 : 0,
      biggestIncrease: risen[0] ?? null,
      periodDelta,
      periodPercent,
      // What share of the cash the owner says they have is going out. The
      // single most useful number here for someone with no accounting
      // background: it turns an abstract total into "this is how much of my
      // money that is".
      fundsShare:
        selected && selected.availableFunds > 0 ? (total / selected.availableFunds) * 100 : null,
    };
  }, [data, selected]);

  if (!selected) return null;

  const periodPicker = (
    <div className="flex gap-1 rounded-xl border border-paper-200 bg-paper-100 p-1">
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.days}
          type="button"
          onClick={() => setPeriodDays(opt.days)}
          aria-pressed={periodDays === opt.days}
          className={`tap rounded-lg px-3 text-[13.5px] font-semibold transition ${
            periodDays === opt.days
              ? "bg-paper text-brand-800 shadow-sm"
              : "text-ink-500 hover:text-brand-800"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <PageHead
        eyebrow="Insights"
        title="Expense insight"
        subtitle="Where your money went, what changed, and anything worth a second look."
        actions={
          <>
            {periodPicker}
            <AskFinSightButton onClick={() => setDrawerOpen(true)} />
          </>
        }
      />

      {error ? (
        <p className="mb-4 rounded-xl bg-tint-danger px-3.5 py-3 text-sm text-tone-danger ring-1 ring-edge-danger">
          {error}
        </p>
      ) : null}

      {/* Skeleton ONLY on the very first load.
          Switching period is a refetch of a page that is already on screen, and
          swapping it for a skeleton throws away a layout the reader is
          currently using, jumps the scroll position, and then throws the
          skeleton away too. Holding the previous render at reduced opacity says
          "same page, updating" — which is what is actually happening. */}
      {isInitialLoad ? (
        <div className="space-y-6" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading your expense insight…</span>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SkeletonStatTile />
            <SkeletonStatTile />
            <SkeletonStatTile />
            <SkeletonStatTile />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <SkeletonPanel lines={6} />
            <SkeletonPanel lines={6} />
          </div>
          <SkeletonPanel lines={5} />
        </div>
      ) : !data || !summary ? null : summary.total === 0 ? (
        <EmptyState
          title={`No expenses recorded ${periodLabel}`}
          icon="◔"
          action={
            <>
              <ButtonLink to="/records/expenses/new" variant="primary">
                Add an expense
              </ButtonLink>
              <ButtonLink to="/records/csv-imports/new" variant="secondary">
                Import from a spreadsheet
              </ButtonLink>
            </>
          }
        >
          Once you record a few expenses, this page shows where your money goes, what changed since last
          period, and anything that looks unusual — in plain language.
        </EmptyState>
      ) : (
        <div
          className={`space-y-6 transition-opacity duration-200 ${
            isRefreshing ? "pointer-events-none opacity-60" : ""
          }`}
          aria-busy={isRefreshing}
        >
          {/* ============================ 1. KPI ROW ============================
              Four headline numbers. These are stat tiles, not charts, because
              each is a single current value — a one-bar bar chart would be a
              worse way to show the same thing. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Total expenses"
              value={<span className="figure">{formatMoney(summary.total)}</span>}
              glyph="◆"
              tone="brand"
              meta={
                <>
                  Across {summary.categoryCount} categor{summary.categoryCount === 1 ? "y" : "ies"}
                  {summary.periodPercent !== null ? (
                    <>
                      {" · "}
                      <span
                        style={{
                          color: summary.periodDelta > 0 ? STATUS_INK.serious : STATUS_INK.good,
                        }}
                      >
                        {summary.periodDelta > 0 ? "▲" : summary.periodDelta < 0 ? "▼" : "—"}{" "}
                        {Math.abs(summary.periodPercent).toFixed(0)}% vs {previousLabel.toLowerCase()}
                      </span>
                    </>
                  ) : null}
                </>
              }
            />

            <KpiCard
              label="Highest category"
              value={<span className="text-xl">{summary.top?.categoryName ?? "—"}</span>}
              glyph="▣"
              tone="info"
              meta={
                summary.top ? (
                  <>
                    {summary.topShare.toFixed(1)}% of total · {formatMoney(summary.top.current)}
                  </>
                ) : (
                  "No spending yet"
                )
              }
            />

            <KpiCard
              label="Biggest increase"
              value={
                summary.biggestIncrease ? (
                  <span className="figure" style={{ color: STATUS_INK.serious }}>
                    +{formatMoney(summary.biggestIncrease.change)}
                  </span>
                ) : (
                  <span className="text-xl" style={{ color: STATUS_INK.good }}>
                    Nothing rose
                  </span>
                )
              }
              glyph="▲"
              tone={summary.biggestIncrease ? "danger" : "brand"}
              meta={
                summary.biggestIncrease
                  ? `${summary.biggestIncrease.categoryName} vs ${previousLabel.toLowerCase()}`
                  : `No category went up vs ${previousLabel.toLowerCase()}`
              }
            />

            <KpiCard
              label="Share of available funds"
              value={
                summary.fundsShare === null ? (
                  <span className="text-xl">—</span>
                ) : (
                  <span className="figure">{summary.fundsShare.toFixed(0)}%</span>
                )
              }
              glyph="◈"
              tone={summary.fundsShare !== null && summary.fundsShare > 75 ? "danger" : "accent"}
              meta={
                summary.fundsShare === null ? (
                  "Add available funds to your business profile"
                ) : (
                  <>
                    {formatMoney(summary.total)} of {formatMoney(selected.availableFunds)}
                  </>
                )
              }
            />
          </div>

          {/* A plain-language warning, only when it is actually warranted. The
              KPI above states the number; this says what to do about it. */}
          {summary.fundsShare !== null && summary.fundsShare > 75 ? (
            <Callout tone="warn">
              Your spending {periodLabel} is{" "}
              <b className="font-semibold">{summary.fundsShare.toFixed(0)}%</b> of the funds you have on
              hand. That doesn't mean anything is wrong — but if sales don't cover it, this is the pace
              that runs the money down.
            </Callout>
          ) : null}

          {/* ================= 2 & 3. WHERE IT WENT / WHAT CHANGED ================= */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel eyebrow="Category share" title="Where your money went" className="min-w-0">
              <DonutChart
                breakdown={data.categoryTrends
                  .filter((t) => t.current > 0)
                  .map((t) => ({ categoryName: t.categoryName, total: t.current }))}
              />
            </Panel>

            <Panel
              eyebrow={`This vs ${previousLabel.toLowerCase()}`}
              title="What changed"
              className="min-w-0"
            >
              <CategoryComparisonChart
                trends={data.categoryTrends}
                currentLabel={periodDays === 7 ? "This week" : "This month"}
                previousLabel={previousLabel}
              />
            </Panel>
          </div>

          {/* ===================== 4. WHEN IT LEFT ===================== */}
          <Panel
            eyebrow="Day by day"
            title="When your money left"
            action={<span className="text-xs text-ink-400">Last {data.periodDays} days</span>}
          >
            <DailySpendChart daily={data.dailyTotals} />
          </Panel>

          {/* ===================== 5. ANYTHING ODD ===================== */}
          <Panel
            eyebrow="Worth a look"
            title="Unusual expenses"
            action={
              data.unusualExpenses.length > 0 ? (
                <span className="text-xs text-ink-400">
                  {data.unusualExpenses.length} flagged
                </span>
              ) : null
            }
          >
            {data.unusualExpenses.length === 0 ? (
              <EmptyState compact title="Nothing looks out of the ordinary" icon="✓">
                FinSight compares each expense against what you usually spend in that category. Nothing
                this period stood out.
              </EmptyState>
            ) : (
              <ul className="space-y-2">
                {data.unusualExpenses.map((u) => {
                  const times = u.categoryMean > 0 ? u.amount / u.categoryMean : null;
                  return (
                    <li
                      key={u.id}
                      className="rounded-xl bg-tint-accent px-3.5 py-3 ring-1 ring-edge-accent"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="min-w-0 text-sm font-semibold text-tone-accent">{u.description}</p>
                        <p className="figure shrink-0 text-sm font-bold text-tone-accent">
                          {formatMoney(u.amount)}
                        </p>
                      </div>
                      {/* Said in multiples of the usual, not in standard
                          deviations. "About 4x your usual Inventory expense"
                          lands; "z-score 3.2" does not. */}
                      <p className="mt-1 text-xs text-tone-accent opacity-90">
                        {u.categoryName} · {u.date.slice(0, 10)} ·{" "}
                        {times && times >= 1.5
                          ? `about ${times.toFixed(1)}× your usual ${formatMoney(u.categoryMean)}`
                          : `usually around ${formatMoney(u.categoryMean)}`}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}

            {data.insufficientHistoryCategories.length > 0 ? (
              <p className="mt-3 text-xs text-ink-400">
                Not enough history yet to check:{" "}
                {data.insufficientHistoryCategories.map((c) => c.categoryName).join(", ")}. FinSight needs
                a few expenses in a category before it can tell what "normal" looks like.
              </p>
            ) : null}
          </Panel>

          {/* ===================== 6. THE TABLE ===================== */}
          {/* The accessible reading of every chart above, and the relief the
              palette's contrast check requires: nothing on this page is
              knowable only by colour. */}
          <Panel
            eyebrow="The numbers"
            title="Category summary"
            action={
              <span className="text-xs text-ink-400">
                {data.periodStart.slice(0, 10)} → {data.periodEnd.slice(0, 10)}
              </span>
            }
            bodyClassName="px-0 pb-0"
          >
            <div className="scroll-slim overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">
                  Expenses by category for {selected.name}, {periodLabel}, compared with the previous
                  period.
                </caption>
                <thead>
                  <tr className="border-y border-paper-200 bg-paper-100/60">
                    <th scope="col" className="px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-ink-500">
                      Category
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-ink-500">
                      This period
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-ink-500">
                      Share
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-ink-500">
                      {previousLabel}
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-ink-500">
                      Change
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-[0.06em] text-ink-500">
                      Count
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.categoryTrends.map((t) => (
                    <tr key={t.categoryId} className="border-b border-paper-200 last:border-0">
                      <th scope="row" className="px-5 py-3 text-left font-medium text-ink-900">
                        {t.categoryName}
                      </th>
                      <td className="figure px-4 py-3 text-right font-semibold text-ink-900">
                        {formatMoney(t.current)}
                      </td>
                      <td className="figure px-4 py-3 text-right text-ink-600">
                        {summary.total > 0 ? ((t.current / summary.total) * 100).toFixed(1) : "0.0"}%
                      </td>
                      <td className="figure px-4 py-3 text-right text-ink-500">
                        {formatMoney(t.previous)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ChangeFigure change={t.change} percent={t.percentChange} />
                      </td>
                      <td className="figure px-5 py-3 text-right text-ink-600">{t.recordCount}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-paper-200 bg-paper-100/60">
                    <th scope="row" className="px-5 py-3 text-left text-xs font-bold uppercase tracking-[0.06em] text-ink-600">
                      Total
                    </th>
                    <td className="figure px-4 py-3 text-right font-bold text-ink-900">
                      {formatMoney(summary.total)}
                    </td>
                    <td className="figure px-4 py-3 text-right text-ink-500">100.0%</td>
                    <td className="figure px-4 py-3 text-right text-ink-500">
                      {formatMoney(data.totals.previous)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChangeFigure change={summary.periodDelta} percent={summary.periodPercent} />
                    </td>
                    <td className="figure px-5 py-3 text-right text-ink-600">
                      {data.categoryTrends.reduce((s, t) => s + t.recordCount, 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>

          <ExplainButton
            businessProfileId={selected.id}
            module="Expense Insights"
            context={buildContext(data, selected.name, periodDays)}
          />
        </div>
      )}

      <AskFinSightDrawer
        businessProfileId={selected.id}
        module="Expense Insights"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
