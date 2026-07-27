import { useEffect, useState } from "react";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { ExplainButton } from "../components/ExplainButton";
import { AskFinSightButton, AskFinSightDrawer } from "../components/AskFinSightDrawer";
import { RecoveryMeter } from "../components/RecoveryMeter";
import { StatTile } from "../components/StatTile";
import { STATUS_TEXT_COLORS } from "../lib/chartPalette";
import type { DayStatus, RecoveryInsight } from "../lib/types";
import { PageHead, Panel } from "../components/ui";
import { Money, formatMoney } from "../components/Money";

// Text-variant colors: these are used both as small type and as pill
// backgrounds under white text, so they need the darker steps.
function statusColor(status: DayStatus): string {
  return status === "below"
    ? STATUS_TEXT_COLORS.critical
    : status === "at"
      ? STATUS_TEXT_COLORS.warning
      : STATUS_TEXT_COLORS.good;
}

function statusLabel(status: DayStatus): string {
  return status === "below" ? "Below target" : status === "at" ? "Reached target" : "Above target";
}

function buildContext(data: RecoveryInsight, businessName: string): string {
  return [
    `Business: ${businessName}`,
    `Expected monthly expenses: PHP ${data.expectedMonthlyExpenses.toLocaleString()}`,
    `Operating days per month: ${data.operatingDays}`,
    `Daily needed target: PHP ${data.dailyNeededTarget.toFixed(2)}`,
    `Sales reference recorded so far this month: PHP ${data.salesThisMonth.toLocaleString()}`,
    `Remaining target: PHP ${data.remainingTarget.toLocaleString()}`,
    `Remaining operating days (approximated): ${data.remainingOperatingDays}`,
    `Adjusted daily target: PHP ${data.adjustedDailyTarget.toFixed(2)}`,
    `Today's target: PHP ${data.todaysTarget.toFixed(2)}; recorded today: PHP ${data.todaysSales.toLocaleString()}; gap: PHP ${Math.abs(
      data.todaysGap,
    ).toFixed(2)} ${data.todaysStatus} target`,
    `Month coverage: ${data.monthCoveragePercent.toFixed(1)}% (${data.onTrack ? "on pace" : "behind pace"})`,
  ].join("\n");
}

export function RecoveryInsightPage() {
  const { selected } = useBusinessProfiles();
  const [data, setData] = useState<RecoveryInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function load() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<RecoveryInsight>("/insights/recovery", {
        params: { businessProfileId: selected.id, coverageDays: 14 },
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
  }, [selected?.id]);

  if (!selected) return null;

  return (
    <div>
      <PageHead
        eyebrow="Insights"
        title="Recovery target"
        subtitle="Did your recorded sales reference reach the needed target, and how much is still needed? This tracks the current calendar month, so there's no period to choose."
        actions={<AskFinSightButton onClick={() => setDrawerOpen(true)} />}
      />

      {error ? <p className="mb-4 text-sm text-tone-danger">{error}</p> : null}

      {loading || !data ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : (
        <div className="space-y-6">
          <Panel title="Inputs">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatTile
                label="Expected monthly expenses"
                value={formatMoney(data.expectedMonthlyExpenses)}
                sublabel="Owner-entered reference"
              />
              <StatTile
                label="Operating days / month"
                value={String(data.operatingDays)}
                sublabel="Owner-entered reference"
              />
              <StatTile
                label="Daily needed target"
                value={formatMoney(data.dailyNeededTarget)}
                sublabel="Computed from the two figures beside it"
              />
            </div>
            <p className="mt-3 text-xs text-ink-400">
              Daily needed target = expected monthly expenses ÷ operating days. This is a target-based
              recovery guide using your sales reference records — it does not calculate formal financial
              results.
            </p>
          </Panel>

          <div className="grid gap-4 sm:grid-cols-4">
            <StatTile label="Today's target" value={formatMoney(data.todaysTarget)} />
            <StatTile
              label="Sales reference today"
              value={formatMoney(data.todaysSales)}
              sublabel="From your records"
            />
            <StatTile
              label="Today's gap"
              value={formatMoney(Math.abs(data.todaysGap))}
              sublabel={statusLabel(data.todaysStatus).toLowerCase()}
            />
            <StatTile
              label="Status"
              value={statusLabel(data.todaysStatus)}
              sublabel={
                data.todaysTarget > 0
                  ? `${((data.todaysSales / data.todaysTarget) * 100).toFixed(0)}% of today's target reached`
                  : undefined
              }
            />
          </div>

          <Panel title="Month-to-date pace">
            <RecoveryMeter recoveryStatus={data} />
          </Panel>

          <Panel title="Remaining recovery target" eyebrow="Recalculated across your remaining operating days">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatTile
                label="Sales reference so far this month"
                value={formatMoney(data.salesThisMonth)}
                sublabel="From your records"
              />
              <StatTile
                label="Remaining target"
                value={formatMoney(data.remainingTarget)}
                sublabel="Computed from your records"
              />
              <StatTile
                label="Remaining operating days"
                value={`≈ ${data.remainingOperatingDays}`}
                sublabel={`${data.calendarDaysLeftInMonth} of ${data.daysInMonth} calendar days left`}
              />
            </div>
            <div className="mt-4 rounded-lg bg-tint-brand p-4">
              <p className="text-xs font-medium text-brand-700">Adjusted daily target</p>
              <Money value={data.adjustedDailyTarget} className="block text-2xl font-semibold text-ink-900" />
              <p className="mt-1 text-xs text-brand-700">
                Remaining target ÷ remaining operating days. This updates as you record more sales references
                — it's a recovery guide, not a guaranteed outcome.
              </p>
            </div>
            {data.remainingOperatingDaysIsApproximated ? (
              <p className="mt-3 text-xs text-ink-400">
                Remaining operating days is an estimate: your profile records how many days a month you
                operate, not which days of the week, so this scales your monthly count by how much of the
                month is left.
              </p>
            ) : null}
          </Panel>

          <div className="overflow-x-auto rounded-2xl bg-paper border border-paper-200 shadow-sm">
            <div className="flex items-center justify-between px-5 pt-5">
              <h2 className="text-sm font-semibold text-ink-700">Daily coverage</h2>
              <span className="text-xs text-ink-400">
                Last {data.coverageDays} day{data.coverageDays === 1 ? "" : "s"}
              </span>
            </div>
            <table className="mt-3 w-full text-left text-sm">
              <thead className="border-b border-paper-200 text-xs uppercase text-ink-500">
                <tr>
                  <th className="px-5 py-3">Day</th>
                  <th className="px-5 py-3 text-right">Needed target</th>
                  <th className="px-5 py-3 text-right">Sales reference</th>
                  <th className="px-5 py-3 text-right">Gap</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.dailyCoverage.map((d) => (
                  <tr key={d.date} className="border-b border-paper-200 last:border-0">
                    <td className="px-5 py-2.5 whitespace-nowrap font-medium text-ink-700">{d.date}</td>
                    <td className="px-5 py-2.5 text-right text-ink-600">
                      <Money value={d.neededTarget} />
                    </td>
                    <td className="px-5 py-2.5 text-right text-ink-600">
                      <Money value={d.sales} />
                    </td>
                    <td
                      className="px-5 py-2.5 text-right font-medium"
                      style={{ color: statusColor(d.status) }}
                    >
                      {d.status === "at" ? (
                        <Money value={0} />
                      ) : (
                        <>
                          <Money value={Math.abs(d.gap)} /> {d.status}
                        </>
                      )}
                    </td>
                    <td className="px-5 py-2.5">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: statusColor(d.status) }}
                      >
                        <span aria-hidden>{d.status === "below" ? "▼" : d.status === "at" ? "＝" : "▲"}</span>
                        {statusLabel(d.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ExplainButton
            businessProfileId={selected.id}
            module="Recovery Target"
            context={buildContext(data, selected.name)}
          />
        </div>
      )}

      <AskFinSightDrawer
        businessProfileId={selected.id}
        module="Recovery Target"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
