import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Alert as AlertBanner, Card, EmptyState, ErrorNote, Money, Screen, SegmentedControl, T } from "../components/ui";
import { RecoveryMeter } from "../components/RecoveryMeter";
import { CategoryChange, CategoryComparison, CoverageColumns, SpendTrend } from "../components/charts";
import { AskFinSight, AskFinSightButton } from "../components/AskFinSight";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { api, errorMessage } from "../lib/api";
import { ACCENT, brand, ink, radius, space, statusText, TAP } from "../theme/tokens";
import type { ExpenseBehavior, RecoveryInsight, SpendingImpact } from "../lib/types";

/*
 * The tab values are screen names. Selection here is derived from the route
 * rather than from state, so the route↔value mapping stays at this call site
 * and SegmentedControl remains a plain controlled component.
 */
const INSIGHT_TABS = [
  { label: "Expenses", value: "ExpenseBehavior" },
  { label: "Spending", value: "SpendingImpact" },
  { label: "Recovery", value: "RecoveryTarget" },
];

/** Shared sub-navigation across the three insight screens. */
function InsightTabs({ navigation, active }: { navigation: any; active: string }) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <SegmentedControl
        options={INSIGHT_TABS}
        value={active}
        onChange={(key) => navigation.navigate(key)}
        accessibilityLabel="Insight sections"
      />
    </View>
  );
}

function useInsight<T>(path: string, query: Record<string, any>, deps: any[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<T>(path, query));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  return { data, loading, error };
}

// ---------------------------------------------------------------- Expense insight

const PERIODS = [
  { label: "This week", value: 7 },
  { label: "This month", value: 30 },
];

export function ExpenseBehaviorScreen({ navigation }: any) {
  const { selected } = useBusinessProfiles();
  const [periodDays, setPeriodDays] = useState(30);
  const [askOpen, setAskOpen] = useState(false);
  const { data, loading, error } = useInsight<ExpenseBehavior>(
    "/insights/expense-behavior",
    { businessProfileId: selected?.id, periodDays },
    [selected?.id, periodDays]
  );

  if (!selected) return null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}>
        <T variant="title" style={{ fontSize: 18, marginBottom: space.md }}>Expense insight</T>
        <InsightTabs navigation={navigation} active="ExpenseBehavior" />

        <View style={{ flexDirection: "row", gap: space.sm, marginBottom: space.lg, alignItems: "center" }}>
          <SegmentedControl
            options={PERIODS}
            value={periodDays}
            onChange={setPeriodDays}
            accessibilityLabel="Period"
          />
          <View style={{ flex: 1 }} />
          <AskFinSightButton onPress={() => setAskOpen(true)} />
        </View>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {loading || !data ? (
          <ActivityIndicator color={brand[600]} style={{ marginTop: space.xl }} />
        ) : (
          <View style={{ gap: space.lg }}>
            {/*
              The shape first, the figures second. The chart answers "is this
              period unusual"; the list below answers "by how much, and where".
            */}
            <Card>
              <SpendTrend
                data={data.dailyTotals ?? []}
                subtitle={`${data.periodStart.slice(5, 10)} to ${data.periodEnd.slice(5, 10)}`}
              />
            </Card>

            <Card>
              <CategoryComparison
                data={data.categoryTrends.map((t) => ({
                  categoryName: t.categoryName,
                  current: t.current,
                  previous: t.previous,
                  percentChange: t.percentChange,
                }))}
                subtitle={`${data.previousPeriodStart.slice(5, 10)}–${data.previousPeriodEnd.slice(5, 10)} vs ${data.periodStart.slice(5, 10)}–${data.periodEnd.slice(5, 10)}`}
                previousLabel="Last period"
                currentLabel="This period"
              />
            </Card>

            <Card>
              <CategoryChange
                data={data.categoryTrends
                  .filter((t) => t.percentChange !== null)
                  .map((t) => ({
                    categoryName: t.categoryName,
                    percentChange: t.percentChange!,
                    direction: t.direction,
                  }))}
                subtitle="Against the period before"
              />
            </Card>

            <Card>
              <T variant="heading" style={{ marginBottom: space.md }}>Category trends</T>
              {data.categoryTrends.length === 0 ? (
                <T variant="caption">No expense records in this period yet.</T>
              ) : (
                data.categoryTrends.map((t) => (
                  <View
                    key={t.categoryId}
                    style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: space.sm, gap: space.sm }}
                  >
                    <T style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>{t.categoryName}</T>
                    <Money value={t.current} size={14} />
                    <T
                      style={{
                        fontSize: 12,
                        width: 62,
                        textAlign: "right",
                        color:
                          t.direction === "up" ? statusText.serious : t.direction === "down" ? statusText.good : ink[400],
                      }}
                    >
                      {t.percentChange === null
                        ? "new"
                        : `${t.direction === "up" ? "▲" : t.direction === "down" ? "▼" : "—"} ${Math.abs(
                            t.percentChange
                          ).toFixed(0)}%`}
                    </T>
                  </View>
                ))
              )}
            </Card>

            <Card>
              <T variant="heading" style={{ marginBottom: space.md }}>Unusual expenses</T>
              {data.unusualExpenses.length === 0 ? (
                <T variant="caption">Nothing flagged as unusual right now.</T>
              ) : (
                <View style={{ gap: space.sm }}>
                  {data.unusualExpenses.map((u) => (
                    <AlertBanner
                      key={u.id}
                      kind="large-expense"
                      label="Unusual for this category"
                      meta={`${u.categoryName} · ${u.date.slice(0, 10)}`}
                    >
                      {u.description} — usually around {Math.round(u.categoryMean).toLocaleString("en-PH")}
                    </AlertBanner>
                  ))}
                </View>
              )}
              {data.insufficientHistoryCategories.length > 0 ? (
                <T variant="caption" style={{ marginTop: space.md }}>
                  Not enough history yet to check:{" "}
                  {data.insufficientHistoryCategories.map((c) => c.categoryName).join(", ")}
                </T>
              ) : null}
            </Card>
          </View>
        )}
      </ScrollView>

      <AskFinSight visible={askOpen} onClose={() => setAskOpen(false)} businessProfileId={selected.id} module="Expense Insights" />
    </Screen>
  );
}

// ---------------------------------------------------------------- Spending impact

export function SpendingImpactScreen({ navigation }: any) {
  const { selected } = useBusinessProfiles();
  const [amount, setAmount] = useState("");
  const [data, setData] = useState<SpendingImpact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);

  async function run() {
    const value = Number(amount);
    if (!selected || !Number.isFinite(value) || value <= 0) {
      setData(null);
      return;
    }
    try {
      setData(await api.get<SpendingImpact>("/insights/spending-impact", {
        businessProfileId: selected.id,
        plannedAmount: value,
        periodDays: 30,
      }));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!selected) return null;

  const bandColor = data
    ? data.impactBand === "High Impact"
      ? statusText.critical
      : data.impactBand === "Noticeable Impact"
        ? statusText.warning
        : statusText.good
    : ink[400];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}>
        <T variant="title" style={{ fontSize: 18, marginBottom: space.md }}>Spending impact</T>
        <InsightTabs navigation={navigation} active="SpendingImpact" />

        <Card style={{ marginBottom: space.lg }}>
          <T variant="caption" style={{ marginBottom: space.md }}>
            A what-if check — nothing is saved, and FinSight won't tell you whether to buy it.
          </T>
          <T variant="label" style={{ marginBottom: 4 }}>Planned amount (PHP)</T>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              onSubmitEditing={run}
              keyboardType="decimal-pad"
              placeholder="e.g. 11000"
              placeholderTextColor={ink[400]}
              style={{
                flex: 1,
                minHeight: TAP,
                borderWidth: 1,
                borderColor: ink[200],
                borderRadius: radius.md,
                paddingHorizontal: space.md,
                fontSize: 15,
                color: ink[900],
              }}
            />
            <Pressable
              onPress={run}
              style={{
                minHeight: TAP,
                paddingHorizontal: space.lg,
                borderRadius: radius.md,
                backgroundColor: ACCENT.fill,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <T style={{ color: ACCENT.onFill, fontFamily: "Inter_600SemiBold" }}>Check</T>
            </Pressable>
          </View>
          {error ? <View style={{ marginTop: space.md }}><ErrorNote>{error}</ErrorNote></View> : null}
        </Card>

        {data ? (
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space.md }}>
              <T variant="heading">Estimated impact</T>
              <View style={{ backgroundColor: bandColor, borderRadius: radius.full, paddingHorizontal: space.md, paddingVertical: 3 }}>
                <T style={{ color: "#fff", fontSize: 12 }}>{data.impactBand}</T>
              </View>
            </View>

            <BeforeAfter label="Available business funds" before={data.funds.before} after={data.funds.after} color={bandColor} />
            <BeforeAfter
              label={`Recorded expenses (last ${data.periodDays} days)`}
              before={data.periodExpenses.before}
              after={data.periodExpenses.after}
              color={bandColor}
            />

            <T variant="caption" style={{ marginTop: space.md }}>
              That uses {data.percentOfFunds >= 999999 ? "more than 100%" : `${data.percentOfFunds.toFixed(1)}%`} of your
              available funds. You treat anything above {data.thresholdPercent}% as high impact.
            </T>
            {data.exceedsFunds ? (
              <View style={{ marginTop: space.md }}>
                <AlertBanner kind="needs-review" label="Exceeds your funds">
                  This is more than the available business funds you have on record.
                </AlertBanner>
              </View>
            ) : null}
          </Card>
        ) : (
          <EmptyState title="Enter an amount to check" icon="◎" body="See what a planned purchase would do to your funds before you spend it." />
        )}

        <View style={{ marginTop: space.lg }}>
          <AskFinSightButton onPress={() => setAskOpen(true)} />
        </View>
      </ScrollView>

      <AskFinSight visible={askOpen} onClose={() => setAskOpen(false)} businessProfileId={selected.id} module="Spending Impact" />
    </Screen>
  );
}

function BeforeAfter({ label, before, after, color }: { label: string; before: number; after: number; color: string }) {
  const scale = Math.max(Math.abs(before), Math.abs(after), 1);
  return (
    <View style={{ marginBottom: space.md }}>
      <T variant="label" style={{ marginBottom: space.sm }}>{label}</T>
      {[
        { k: "Before", v: before, c: ink[300] },
        { k: "After", v: after, c: color },
      ].map((row) => (
        <View key={row.k} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: 4 }}>
          <T variant="caption" style={{ width: 44 }}>{row.k}</T>
          <View style={{ flex: 1, height: 12, backgroundColor: ink[100], borderRadius: 3, overflow: "hidden" }}>
            <View style={{ width: `${(Math.abs(row.v) / scale) * 100}%`, height: "100%", backgroundColor: row.c }} />
          </View>
          <Money value={row.v} size={12} color={row.v < 0 ? statusText.critical : ink[700]} />
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- Recovery target

export function RecoveryTargetScreen({ navigation }: any) {
  const { selected } = useBusinessProfiles();
  const [askOpen, setAskOpen] = useState(false);
  const { data, loading, error } = useInsight<RecoveryInsight>(
    "/insights/recovery",
    { businessProfileId: selected?.id, coverageDays: 14 },
    [selected?.id]
  );

  if (!selected) return null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}>
        <T variant="title" style={{ fontSize: 18, marginBottom: space.md }}>Recovery target</T>
        <InsightTabs navigation={navigation} active="RecoveryTarget" />

        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {loading || !data ? (
          <ActivityIndicator color={brand[600]} style={{ marginTop: space.xl }} />
        ) : (
          <View style={{ gap: space.lg }}>
            <Card>
              <RecoveryMeter data={data} />
            </Card>

            <Card>
              <T variant="heading" style={{ marginBottom: 4 }}>Remaining recovery target</T>
              <T variant="caption" style={{ marginBottom: space.md }}>
                Recalculated across your remaining operating days. This is an estimate — your profile records how many
                days a month you operate, not which days.
              </T>
              <Row label="Expected monthly expenses" value={data.expectedMonthlyExpenses} />
              <Row label="Sales reference so far" value={data.salesThisMonth} />
              <Row label="Remaining target" value={data.remainingTarget} />
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: space.sm }}>
                <T style={{ fontSize: 14 }}>Remaining operating days</T>
                <T style={{ fontSize: 14 }}>≈ {data.remainingOperatingDays}</T>
              </View>
            </Card>

            {/*
              The columns show the run of days at a glance and where the
              target line sits; the rows below keep the exact figure and the
              gap for each day, which a 110px chart cannot carry.
            */}
            <Card>
              <CoverageColumns
                data={data.dailyCoverage.map((d) => ({ date: d.date, amount: d.sales }))}
                target={data.dailyNeededTarget}
                subtitle="Sales each day against the target"
              />
            </Card>

            <Card>
              <T variant="heading" style={{ marginBottom: space.md }}>Day by day</T>
              {data.dailyCoverage.map((d) => {
                const c =
                  d.status === "below" ? statusText.critical : d.status === "at" ? statusText.warning : statusText.good;
                return (
                  <View
                    key={d.date}
                    style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, gap: space.sm }}
                  >
                    <T variant="caption" style={{ width: 74 }}>{d.date.slice(5)}</T>
                    <Money value={d.sales} size={13} />
                    <T style={{ fontSize: 12, color: c, width: 96, textAlign: "right" }}>
                      {d.status === "at" ? "Reached" : `${Math.round(Math.abs(d.gap)).toLocaleString("en-PH")} ${d.status}`}
                    </T>
                  </View>
                );
              })}
            </Card>

            <AskFinSightButton onPress={() => setAskOpen(true)} />
          </View>
        )}
      </ScrollView>

      <AskFinSight visible={askOpen} onClose={() => setAskOpen(false)} businessProfileId={selected.id} module="Recovery Target" />
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: space.sm, gap: space.sm }}>
      <T style={{ fontSize: 14, flex: 1 }}>{label}</T>
      <Money value={value} size={14} />
    </View>
  );
}
