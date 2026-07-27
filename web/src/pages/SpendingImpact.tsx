import { useEffect, useState } from "react";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { ExplainButton } from "../components/ExplainButton";
import { AskFinSightButton, AskFinSightDrawer } from "../components/AskFinSightDrawer";
import { STATUS_COLORS, STATUS_TEXT_COLORS } from "../lib/chartPalette";
import type { ImpactBand, SpendingImpact as SpendingImpactData } from "../lib/types";
import { PageHead } from "../components/ui";

const PERIOD_OPTIONS = [
  { label: "Today", days: 1 },
  { label: "This week", days: 7 },
  { label: "This month", days: 30 },
];

function peso(n: number): string {
  return `PHP ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const BAND_STATUS: Record<ImpactBand, keyof typeof STATUS_COLORS> = {
  "Low Impact": "good",
  "Noticeable Impact": "warning",
  "High Impact": "critical",
};

function percentText(data: SpendingImpactData): string {
  return data.percentOfFunds >= 999999 ? "more than 100%" : `${data.percentOfFunds.toFixed(1)}%`;
}

function buildContext(data: SpendingImpactData, businessName: string): string {
  return [
    `Business: ${businessName}`,
    `Planned expense: PHP ${data.plannedAmount.toLocaleString()}`,
    `Available funds before: PHP ${data.funds.before.toLocaleString()}`,
    `Available funds after: PHP ${data.funds.after.toLocaleString()}`,
    `Share of available funds used: ${percentText(data)}`,
    `Impact band: ${data.impactBand} (high-impact threshold is ${data.thresholdPercent}% of available funds = PHP ${data.thresholdAmount.toLocaleString()})`,
    `Recorded expenses last ${data.periodDays} days before: PHP ${data.periodExpenses.before.toLocaleString()}`,
    `Recorded expenses if this is included: PHP ${data.periodExpenses.after.toLocaleString()}`,
    data.exceedsFunds ? "This WOULD exceed available funds." : "This would NOT exceed available funds.",
  ].join("\n");
}

// Paired before/after bars. Both bars in a pair share one scale (the larger
// of the two values), so their lengths are directly comparable.
function BeforeAfterBars({
  before,
  after,
  afterColor,
  afterIsNegative,
}: {
  before: number;
  after: number;
  afterColor: string;
  afterIsNegative?: boolean;
}) {
  const scale = Math.max(Math.abs(before), Math.abs(after), 1);
  const rows = [
    { key: "Before", value: before, color: "#94a3b8" },
    { key: "After", value: after, color: afterColor },
  ];
  return (
    <div className="mt-3 space-y-2">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-xs text-ink-500">{r.key}</span>
          <div className="h-4 flex-1 overflow-hidden rounded-sm bg-paper-100">
            <div
              className="h-full rounded-sm"
              style={{ width: `${(Math.abs(r.value) / scale) * 100}%`, backgroundColor: r.color }}
            />
          </div>
          <span
            className={`w-28 shrink-0 text-right text-xs font-medium ${
              r.key === "After" && afterIsNegative ? "text-tone-danger" : "text-ink-700"
            }`}
          >
            {peso(r.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SpendingImpact() {
  const { selected } = useBusinessProfiles();
  const [plannedAmount, setPlannedAmount] = useState<number | "">("");
  const [description, setDescription] = useState("");
  const [periodDays, setPeriodDays] = useState(30);
  const [data, setData] = useState<SpendingImpactData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!selected || plannedAmount === "") {
      setData(null);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const { data } = await api.get<SpendingImpactData>("/insights/spending-impact", {
          params: { businessProfileId: selected.id, plannedAmount, periodDays },
        });
        setData(data);
        setError(null);
      } catch (err) {
        setError(getErrorMessage(err));
      }
    }, 200);
    return () => clearTimeout(timeout);
  }, [selected, plannedAmount, periodDays]);

  if (!selected) return null;

  const bandStatus = data ? BAND_STATUS[data.impactBand] : null;

  return (
    <div>
      <PageHead
        eyebrow="Insights"
        title="Spending impact"
        subtitle="Spending-impact assessment — what may happen if I spend this amount? This is a what-if check; nothing is saved."
        actions={<AskFinSightButton onClick={() => setDrawerOpen(true)} />}
      />

      <div className="mb-4 rounded-lg bg-tint-brand p-3 text-xs text-tone-brand">
        <b>Two ways to run a scenario.</b> Ask FinSight in plain language (e.g. "What if I spend ₱11,000 on a
        fridge?"), or use the form below. Either way, FinSight's calculations are structured — they are not
        invented by AI.
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-paper p-5 border border-paper-200 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-ink-700">Simulate a planned expense</h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="plannedAmount" className="block text-sm font-medium text-ink-700">
                Planned amount (PHP)
              </label>
              <input
                id="plannedAmount"
                type="number"
                min={0}
                step="0.01"
                value={plannedAmount}
                onChange={(e) => setPlannedAmount(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="e.g. 11000"
                className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="periodDays" className="block text-sm font-medium text-ink-700">
                Compare against
              </label>
              <select
                id="periodDays"
                value={periodDays}
                onChange={(e) => setPeriodDays(Number(e.target.value))}
                className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
              >
                {PERIOD_OPTIONS.map((o) => (
                  <option key={o.days} value={o.days}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3">
            <label htmlFor="description" className="block text-sm font-medium text-ink-700">
              Description{" "}
              <span className="font-normal text-ink-400">(optional, for your own reference)</span>
            </label>
            <input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Display fridge for drinks"
              className="mt-1 min-h-tap w-full rounded-lg border border-ink-200 px-3 text-sm"
            />
          </div>

          {error ? <p className="mt-3 text-sm text-tone-danger">{error}</p> : null}

          <p className="mt-4 rounded-lg bg-tint-accent p-3 text-xs text-tone-accent">
            <span aria-hidden>⚠ </span>
            This simulation supports spending awareness and does not tell you whether to proceed with the
            purchase.
          </p>
        </div>

        <div className="rounded-2xl bg-paper p-5 border border-paper-200 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink-700">Estimated impact</h2>
            {data && bandStatus ? (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                style={{ backgroundColor: STATUS_TEXT_COLORS[bandStatus] }}
              >
                <span aria-hidden>
                  {data.impactBand === "High Impact"
                    ? "▲"
                    : data.impactBand === "Noticeable Impact"
                      ? "●"
                      : "✓"}
                </span>
                {data.impactBand}
              </span>
            ) : null}
          </div>

          {!data ? (
            <p className="text-sm text-ink-400">Enter a planned amount to see the impact.</p>
          ) : (
            <div className="space-y-5">
              {data.exceedsFunds ? (
                <p
                  className="rounded-lg p-3 text-sm font-medium text-white"
                  style={{ backgroundColor: STATUS_TEXT_COLORS.critical }}
                >
                  <span aria-hidden>⚠ </span>This would exceed your available funds.
                </p>
              ) : null}

              <div>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Available business funds
                  </h3>
                  <span className="text-xs text-ink-500">{percentText(data)} used</span>
                </div>
                <BeforeAfterBars
                  before={data.funds.before}
                  after={data.funds.after}
                  afterColor={STATUS_COLORS[bandStatus!]}
                  afterIsNegative={data.funds.after < 0}
                />
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Recorded expenses (last {data.periodDays} day{data.periodDays === 1 ? "" : "s"})
                </h3>
                <BeforeAfterBars
                  before={data.periodExpenses.before}
                  after={data.periodExpenses.after}
                  afterColor={STATUS_COLORS[bandStatus!]}
                />
              </div>

              <p className="text-xs text-ink-500">
                Spending {peso(data.plannedAmount)}
                {description ? ` on ${description}` : ""} would use {percentText(data)} of your available
                funds. You treat anything above {data.thresholdPercent}% of available funds (
                {peso(data.thresholdAmount)}) as a high-impact expense — you can change that in your business
                profile.
              </p>

              <ExplainButton
                businessProfileId={selected.id}
                module="Spending Impact"
                context={buildContext(data, selected.name)}
              />
            </div>
          )}
        </div>
      </div>

      <AskFinSightDrawer
        businessProfileId={selected.id}
        module="Spending Impact"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
