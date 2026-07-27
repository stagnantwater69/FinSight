import { useEffect, useState } from "react";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { ExplainButton } from "../components/ExplainButton";
import { AskFinSightButton, AskFinSightDrawer } from "../components/AskFinSightDrawer";
import { OTHER_COLOR, STATUS_COLORS } from "../lib/chartPalette";
import type { ImpactBand, SpendingImpact as SpendingImpactData } from "../lib/types";
import { Callout, InfoNote, PageHead, Panel, Pill, type PillTone } from "../components/ui";
import { Field, MoneyInput, SelectInput, TextInput } from "../components/Field";
import { Money } from "../components/Money";

const PERIOD_OPTIONS = [
  { label: "Today", days: 1 },
  { label: "This week", days: 7 },
  { label: "This month", days: 30 },
];

const BAND_STATUS: Record<ImpactBand, keyof typeof STATUS_COLORS> = {
  "Low Impact": "good",
  "Noticeable Impact": "warning",
  "High Impact": "critical",
};

// The impact band as a themed Pill rather than a white-on-solid chip painted
// with an inline style. The band glyphs stay: severity must survive greyscale
// and colourblindness, so the shape carries it as well as the colour.
const BAND_TONE: Record<ImpactBand, PillTone> = {
  "Low Impact": "ok",
  "Noticeable Impact": "warn",
  "High Impact": "danger",
};

const BAND_GLYPH: Record<ImpactBand, string> = {
  "Low Impact": "✓",
  "Noticeable Impact": "●",
  "High Impact": "▲",
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
    // The neutral "before" bar uses the palette's documented neutral rather
    // than an arbitrary hex, so it stays in step with the charts.
    { key: "Before", value: before, color: OTHER_COLOR },
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
          <Money
            value={r.value}
            className={`w-28 shrink-0 text-right text-xs font-medium ${
              r.key === "After" && afterIsNegative ? "text-tone-danger" : "text-ink-700"
            }`}
          />
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

      <div className="mb-4">
        <Callout tone="brand">
          <b className="font-semibold">Two ways to run a scenario.</b> Ask FinSight in plain language (e.g.
          "What if I spend ₱11,000 on a fridge?"), or use the form below. Either way, FinSight's
          calculations are structured — they are not invented by AI.
        </Callout>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Simulate a planned expense">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Planned amount" htmlFor="plannedAmount">
              <MoneyInput
                min={0}
                value={plannedAmount}
                onChange={(e) => setPlannedAmount(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="11000"
              />
            </Field>
            <Field label="Compare against" htmlFor="periodDays">
              <SelectInput value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))}>
                {PERIOD_OPTIONS.map((o) => (
                  <option key={o.days} value={o.days}>
                    {o.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>

          <div className="mt-3">
            <Field
              label="Description"
              htmlFor="description"
              optional
              hint="For your own reference — this is not saved."
            >
              <TextInput
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Display fridge for drinks"
              />
            </Field>
          </div>

          {error ? (
            <p role="alert" className="mt-3 text-sm text-tone-danger">
              {error}
            </p>
          ) : null}

          <div className="mt-4">
            <Callout tone="warn">
              This simulation supports spending awareness and does not tell you whether to proceed with the
              purchase.
            </Callout>
          </div>
        </Panel>

        <Panel
          title="Estimated impact"
          action={
            data ? (
              <Pill tone={BAND_TONE[data.impactBand]}>
                <span aria-hidden>{BAND_GLYPH[data.impactBand]}</span>
                {data.impactBand}
              </Pill>
            ) : null
          }
        >
          {!data ? (
            <p className="text-sm text-ink-400">Enter a planned amount to see the impact.</p>
          ) : (
            <div className="space-y-5">
              {data.exceedsFunds ? (
                <Callout tone="warn">
                  <b className="font-semibold">This would exceed your available funds.</b>
                </Callout>
              ) : null}

              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Available business funds
                  </h3>
                  <span className="text-xs text-ink-500">{percentText(data)} used</span>
                </div>
                {/* Provenance: this figure is the owner's own, not something
                    FinSight derived. Same treatment as Dashboard's KPI meta. */}
                <p className="mt-0.5 text-xs text-ink-400">Owner-entered reference</p>
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
                <p className="mt-0.5 text-xs text-ink-400">Computed from your records</p>
                {/*
                  The one genuinely thin figure on this page.

                  The impact band above is arithmetic on funds the owner
                  entered, so it holds regardless of how much history exists.
                  This comparison is not: with nothing recorded in the period,
                  the "before" bar is empty and the "after" bar fills the width,
                  which reads as a dramatic increase when it is really a single
                  data point against no baseline. Saying so is cheaper than
                  letting the owner draw the wrong conclusion — and item 19 is
                  lost precisely by claiming confidence that isn't there.
                */}
                {data.periodExpenses.before === 0 ? (
                  <div className="mt-2">
                    <InfoNote>
                      You have no expenses recorded in the last {data.periodDays} day
                      {data.periodDays === 1 ? "" : "s"}, so there's nothing to compare this against yet.
                      The funds figure above is still accurate — this comparison gets useful once you've
                      recorded a few days.
                    </InfoNote>
                  </div>
                ) : (
                  <BeforeAfterBars
                    before={data.periodExpenses.before}
                    after={data.periodExpenses.after}
                    afterColor={STATUS_COLORS[bandStatus!]}
                  />
                )}
              </div>

              <p className="text-xs text-ink-500">
                Spending <Money value={data.plannedAmount} />
                {description ? ` on ${description}` : ""} would use {percentText(data)} of your available
                funds. You treat anything above {data.thresholdPercent}% of available funds (
                <Money value={data.thresholdAmount} />) as a high-impact expense — you can change that in
                your business profile.
              </p>

              <ExplainButton
                businessProfileId={selected.id}
                module="Spending Impact"
                context={buildContext(data, selected.name)}
              />
            </div>
          )}
        </Panel>
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
