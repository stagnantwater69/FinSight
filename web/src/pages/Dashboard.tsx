import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { useExpenseCategories } from "../context/ExpenseCategoryContext";
import { useNotifications } from "../context/NotificationContext";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { CategoryBreakdownChart } from "../components/CategoryBreakdownChart";
import { RecoveryMeter } from "../components/RecoveryMeter";
import { AlertsPanel } from "../components/AlertsPanel";
import { AskFinSightButton, AskFinSightDrawer } from "../components/AskFinSightDrawer";
import { SkeletonDashboard } from "../components/Skeleton";
import { EmptyState, SetupProgress } from "../components/EmptyState";
import { ButtonLink } from "../components/Button";
import { formatMoney } from "../components/Money";
import { DonutChart } from "../components/DonutChart";
import { AiCard, KpiCard, Kw, Panel, PageHead, Pill } from "../components/ui";
import { IconArrowRight } from "../components/icons";
import type { DashboardSummary } from "../lib/types";

const PERIOD_OPTIONS = [
  { label: "Today", days: 1 },
  { label: "This week", days: 7 },
  { label: "This month", days: 30 },
];

export function Dashboard() {
  const { selected } = useBusinessProfiles();
  const { categories } = useExpenseCategories();
  const { markRead } = useNotifications();
  const [periodDays, setPeriodDays] = useState(30);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function load() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<DashboardSummary>("/dashboard/summary", {
        params: { businessProfileId: selected.id, periodDays },
      });
      setSummary(data);
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

  /**
   * Goes through the shared notification context rather than calling the API
   * directly.
   *
   * The dashboard's `summary.alerts` and the topbar bell are two views of the
   * same rows. Marking one read here used to PATCH straight to the server,
   * which left the bell's badge showing a count that included an alert the
   * user had visibly just dismissed — it only corrected itself on the next
   * poll or reload. Routing through the context updates both at once.
   *
   * The local `summary` copy still has to be updated too: it came from
   * /dashboard/summary, not from the notifications endpoint, so the context
   * has no way to reach into it.
   */
  async function handleMarkRead(id: number) {
    setSummary((prev) =>
      prev
        ? { ...prev, alerts: prev.alerts.map((a) => (a.id === id ? { ...a, readStatus: true } : a)) }
        : prev,
    );
    await markRead(id);
  }

  if (!selected) return null;

  const hasAnyRecords =
    !!summary && (summary.overview.totalExpenses > 0 || summary.overview.totalSalesReference > 0);

  // ---- values the KPI row and the summary card read -----------------------
  // All derived from `summary`, which the server computed. Nothing here
  // recalculates a financial figure; it only picks and phrases.

  const periodLabel = `Last ${summary?.periodDays ?? 0} day${summary?.periodDays === 1 ? "" : "s"}`;

  const topCategory = summary?.expenseCategoryBreakdown?.length
    ? [...summary.expenseCategoryBreakdown].sort((a, b) => b.total - a.total)[0]
    : null;

  const unreadAlerts = summary?.alerts.filter((a) => !a.readStatus).length ?? 0;

  /**
   * Recovery reduced to a KPI-sized verdict.
   *
   * `onTrack` is the server's own judgement — this does not re-derive it.
   * The "not set up" case is distinct from "behind": an owner who never
   * entered expected monthly expenses is not failing a target, they simply
   * have not set one, and telling them they are "behind" would be wrong.
   */
  const recovery: { label: string; meta: string; tone: "brand" | "accent" | "danger" | "info" } = !summary
    ? { label: "—", meta: "", tone: "info" }
    : summary.recoveryStatus.expectedMonthlyExpenses <= 0
      ? { label: "Not set up", meta: "Add expected monthly expenses", tone: "info" }
      : summary.recoveryStatus.onTrack
        ? {
            label: "On track",
            meta: `${Math.round(summary.recoveryStatus.monthCoveragePercent)}% of the month covered`,
            tone: "brand",
          }
        : {
            label: "Behind pace",
            meta: `${formatMoney(summary.recoveryStatus.remainingTarget)} still needed`,
            tone: "danger",
          };

  return (
    <div>
      <PageHead
        eyebrow="Financial summary"
        title="Dashboard"
        subtitle={
          <>
            Overview for <b className="font-semibold text-ink-700">{selected.name}</b>
          </>
        }
        actions={
          <>
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
            <AskFinSightButton onClick={() => setDrawerOpen(true)} />
          </>
        }
      />

      {/* Goal-Gradient: a brand-new business sees how close it is to a first
          insight, rather than three unrelated empty panels. */}
      {!loading && summary ? (
        <SetupProgress
          steps={[
            { label: "Set up your business profile", done: true },
            { label: "Add an expense category", done: categories.length > 0 },
            { label: "Record your first expense or sale", done: hasAnyRecords },
          ]}
        />
      ) : null}

      {error ? (
        <p className="mb-4 rounded-lg bg-tint-danger p-3 text-sm text-tone-danger ring-1 ring-edge-danger">{error}</p>
      ) : null}

      {/* Doherty: the dashboard commits to its shape immediately on load and on
          every period / business switch, so the change feels instant even while
          the request is in flight. */}
      {loading || !summary ? (
        <SkeletonDashboard />
      ) : (
        // 8px scale throughout: 24px between the major bands, 20px inside a
        // band. Consistent vertical rhythm is what stops a dashboard reading
        // as a pile of unrelated cards.
        <div className="space-y-6">
          {/*
            Serial Position Effect — the order here is deliberate.

            FIRST: Available business funds. The single figure owners check most
            often ("how much do I actually have?"), so it takes the primacy slot.

            MIDDLE: expenses and sales. Important context, but they are read as a
            pair and are the least likely to be recalled individually — which is
            what the weak middle position is for.

            LAST: Recovery status, in its own full-width band. It is the
            actionable "so what" of the whole screen, and recency makes it the
            thing an owner leaves with.
          */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Available business funds"
              value={<span className="figure">{formatMoney(summary.overview.availableFunds)}</span>}
              meta="Owner-entered reference"
              glyph="◆"
              tone="brand"
            />
            <KpiCard
              label="Total expenses"
              value={<span className="figure">{formatMoney(summary.overview.totalExpenses)}</span>}
              meta={periodLabel}
              glyph="▾"
              tone="accent"
            />
            <KpiCard
              label="Total sales reference"
              value={<span className="figure">{formatMoney(summary.overview.totalSalesReference)}</span>}
              meta={periodLabel}
              glyph="▴"
              tone="info"
            />
            <KpiCard
              label="Recovery status"
              value={<span className="text-xl">{recovery.label}</span>}
              meta={recovery.meta}
              glyph="◎"
              tone={recovery.tone}
            />
          </div>

          {/*
            The mockup puts an "AI Summary" card here. This is the same
            surface, but the sentence below is composed from the figures
            already on this page — it is NOT AI-written, so it does not claim
            to be. Real AI lives one click away in Ask FinSight, where the
            answer is grounded and the disclaimer travels with it.
          */}
          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr] xl:grid-cols-[2fr_1fr]">
            <AiCard
              title="This month at a glance"
              subtitle="Composed from your records — not AI-written"
              footer={
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="tap-inline font-semibold text-accent-200 underline-offset-2 hover:underline"
                >
                  Ask FinSight about any of this →
                </button>
              }
            >
              {topCategory ? (
                <>
                  <Kw>{topCategory.categoryName}</Kw> is your largest expense category{" "}
                  {periodLabel.toLowerCase()}, at <Kw>{formatMoney(topCategory.total)}</Kw>.{" "}
                </>
              ) : (
                <>No expenses recorded {periodLabel.toLowerCase()} yet. </>
              )}
              {summary.recoveryStatus.expectedMonthlyExpenses > 0 ? (
                <>
                  Sales reference so far this month is{" "}
                  <Kw>{formatMoney(summary.recoveryStatus.salesThisMonth)}</Kw> against a monthly target of{" "}
                  <Kw>{formatMoney(summary.recoveryStatus.expectedMonthlyExpenses)}</Kw>.{" "}
                </>
              ) : null}
              {summary.recordsNeedingReview > 0 ? (
                <>
                  <Kw>
                    {summary.recordsNeedingReview} record
                    {summary.recordsNeedingReview === 1 ? "" : "s"}
                  </Kw>{" "}
                  need{summary.recordsNeedingReview === 1 ? "s" : ""} review before being counted as settled.
                </>
              ) : (
                <>Nothing is waiting for review.</>
              )}
            </AiCard>

            <Panel
              title="Things to review"
              action={
                summary.recordsNeedingReview > 0 ? (
                  <Pill tone="warn">
                    {summary.recordsNeedingReview} item{summary.recordsNeedingReview === 1 ? "" : "s"}
                  </Pill>
                ) : (
                  <Pill tone="ok">All clear</Pill>
                )
              }
            >
              {summary.recordsNeedingReview === 0 ? (
                <p className="text-sm text-ink-500">
                  Nothing needs a second look right now. Flagged records show up here.
                </p>
              ) : (
                <Link
                  to="/records/flagged"
                  className="flex min-h-tap items-center gap-2 rounded-xl border border-paper-200 px-3.5 text-sm font-semibold text-tone-brand transition hover:border-brand-300 hover:bg-tint-brand"
                >
                  Review flagged records
                  <IconArrowRight className="ml-auto h-4 w-4" />
                </Link>
              )}
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel eyebrow="Where your money went" title="Expense distribution" className="min-w-0">
              {summary.expenseCategoryBreakdown.length === 0 ? (
                <EmptyState compact title="No expenses in this period yet" icon="◔">
                  Once you record an expense, this is where you'll see which categories use the most.
                </EmptyState>
              ) : (
                <>
                  <DonutChart breakdown={summary.expenseCategoryBreakdown} />
                  {/* The bar view stays below the donut. A donut is good at
                      "what share", poor at "how much bigger" — the bars answer
                      the second question, and give a non-circular reading for
                      anyone the donut fails. */}
                  <div className="mt-5 border-t border-paper-200 pt-4">
                    <CategoryBreakdownChart breakdown={summary.expenseCategoryBreakdown} />
                  </div>
                </>
              )}
            </Panel>

            <Panel
              title="Alerts"
              className="min-w-0"
              action={
                unreadAlerts > 0 ? (
                  <Pill tone="warn">{unreadAlerts} unread</Pill>
                ) : (
                  <Pill tone="ok">All read</Pill>
                )
              }
            >
              <AlertsPanel alerts={summary.alerts} onMarkRead={handleMarkRead} />
            </Panel>
          </div>

          {/* Recency slot — full width so it reads as the closing statement. */}
          <Panel
            eyebrow="Target-based recovery"
            title="Recovery target"
            action={<span className="text-xs text-ink-400">This month</span>}
          >
            {summary.recoveryStatus.expectedMonthlyExpenses > 0 ? (
              <RecoveryMeter recoveryStatus={summary.recoveryStatus} />
            ) : (
              <EmptyState compact title="Add your expected monthly expenses" icon="◎">
                FinSight needs to know roughly what a month costs you before it can work out a daily sales
                target.
              </EmptyState>
            )}
            <div className="mt-4 border-t border-paper-200 pt-3">
              <Link
                to="/insights/recovery"
                className="tap-inline text-sm font-semibold text-brand-700 hover:text-brand-800"
              >
                See the full recovery breakdown →
              </Link>
            </div>
          </Panel>

          {!hasAnyRecords ? (
            <EmptyState
              title="Nothing recorded in this period yet"
              action={
                <ButtonLink to="/records/expenses/new" variant="primary">
                  Add your first expense
                </ButtonLink>
              }
            >
              Your dashboard fills in as soon as you record something. Even a single day of expenses gives
              FinSight enough to work with.
            </EmptyState>
          ) : null}
        </div>
      )}

      <AskFinSightDrawer
        businessProfileId={selected.id}
        module="Dashboard"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
