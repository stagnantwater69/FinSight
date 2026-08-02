import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Alert, Button, Card, EmptyState, ErrorNote, Screen, ScreenHeader, SegmentedControl, SetupProgress, StatTile, T } from "../components/ui";
import { RecoveryMeter } from "../components/RecoveryMeter";
import { CategoryBreakdown, DonutChart } from "../components/charts";
import { AtAGlance } from "../components/AtAGlance";
import { SkeletonDashboard } from "../components/Skeleton";
import { AskFinSight, AskFinSightButton } from "../components/AskFinSight";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { api, errorMessage } from "../lib/api";
import { alertKindFromType } from "../lib/money";
import { brand, space } from "../theme/tokens";
import type { DashboardSummary } from "../lib/types";

const PERIODS = [
  { label: "Today", value: 1 },
  { label: "Week", value: 7 },
  { label: "Month", value: 30 },
];

export function DashboardScreen({ navigation }: any) {
  const { selected, categories, error: profilesError, refresh: refreshProfiles } = useBusinessProfiles();
  const [periodDays, setPeriodDays] = useState(30);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!selected) return;
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        setSummary(await api.get<DashboardSummary>("/dashboard/summary", {
          businessProfileId: selected.id,
          periodDays,
        }));
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selected?.id, periodDays]
  );

  // Refetch on focus so a record added on another tab is reflected when the
  // user comes back, rather than showing a stale figure.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!selected) {
    return (
      <Screen>
        <View style={{ padding: space.lg }}>
          {/*
            An empty list means one of two very different things, and saying
            the wrong one is costly: telling an owner who already has
            businesses to "set up a business first" reads as though their data
            is gone, and invites them to create a duplicate. So a failed load
            says so, and offers to try again.
          */}
          {profilesError ? (
            <>
              <ErrorNote>{profilesError}</ErrorNote>
              <Button
                title="Try again"
                variant="secondary"
                onPress={() => refreshProfiles().catch(() => undefined)}
                style={{ marginTop: space.md }}
              />
            </>
          ) : (
            <EmptyState
              title="Set up a business first"
              body="FinSight needs a business profile before it can show you anything."
            />
          )}
        </View>
      </Screen>
    );
  }

  const hasRecords =
    !!summary && (summary.overview.totalExpenses > 0 || summary.overview.totalSalesReference > 0);

  /*
   * The review card's sentence, written once.
   *
   * It is both the visible line and the card's spoken label, and the two must
   * say the same thing — a label that has drifted from what is on screen is
   * worse than no label at all, because only one of the two audiences can see
   * the disagreement.
   */
  const reviewLine = !summary
    ? ""
    : summary.recordsNeedingReview === 0
      ? "No records need review right now"
      : `${summary.recordsNeedingReview} record${summary.recordsNeedingReview === 1 ? "" : "s"} need${
          summary.recordsNeedingReview === 1 ? "s" : ""
        } review`;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2, gap: space.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={brand[600]} />}
      >
        <View>
          <ScreenHeader
            eyebrow="Dashboard"
            title={selected.name}
            subtitle={`Last ${periodDays} day${periodDays === 1 ? "" : "s"}`}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" }}>
            <SegmentedControl
              options={PERIODS}
              value={periodDays}
              onChange={setPeriodDays}
              accessibilityLabel="Period"
            />
            <AskFinSightButton onPress={() => setAskOpen(true)} />
          </View>
        </View>

        {!loading && summary ? (
          <SetupProgress
            steps={[
              { label: "Set up your business profile", done: true },
              { label: "Add an expense category", done: categories.length > 0 },
              { label: "Record your first expense or sale", done: hasRecords },
            ]}
          />
        ) : null}

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        {loading || !summary ? (
          // Shaped like the dashboard rather than a centred spinner, so the
          // layout does not jump when the figures land.
          <SkeletonDashboard />
        ) : (
          <>
            {/*
              Serial Position Effect — same order as web, and for the same
              reasons. Available funds takes the primacy slot (the figure owners
              check most), expenses/sales sit in the weak middle, and Recovery
              target closes the screen because it is the actionable "so what".
            */}
            <AtAGlance summary={summary} onAsk={() => setAskOpen(true)} />

            <StatTile label="Available business funds" value={summary.overview.availableFunds} emphasis />
            <View style={{ flexDirection: "row", gap: space.md }}>
              <StatTile
                label="Expenses"
                value={summary.overview.totalExpenses}
                sublabel={`Last ${summary.periodDays} day${summary.periodDays === 1 ? "" : "s"}`}
              />
              <StatTile
                label="Sales reference"
                value={summary.overview.totalSalesReference}
                sublabel={`Last ${summary.periodDays} day${summary.periodDays === 1 ? "" : "s"}`}
              />
            </View>
            {/*
              "Sales reference" reads like an invoice number until someone says
              otherwise. Same clarification the Add sales screen carries, so the
              term means one thing wherever it appears.
            */}
            <T variant="caption">
              Sales reference is a sale you recorded for your own tracking, not a receipt given to a customer.
            </T>

            <Pressable
              onPress={() => navigation.navigate("Records", { screen: "FlaggedRecords" })}
              accessibilityRole="button"
              // Announced as a plain card until now, so there was nothing to
              // say it could be tapped. The label carries the count and where
              // the tap goes, instead of ending on an arrow glyph.
              accessibilityLabel={`${reviewLine}. Review flagged records.`}
            >
              <Card>
                <T style={{ fontSize: 14 }}>{reviewLine}</T>
                <T style={{ color: brand[700], fontSize: 14, marginTop: 2 }}>Review flagged records →</T>
              </Card>
            </Pressable>

            <Card>
              <DonutChart
                data={summary.expenseCategoryBreakdown}
                subtitle={`Last ${summary.periodDays} day${summary.periodDays === 1 ? "" : "s"}`}
              />
            </Card>

            <Card>
              <CategoryBreakdown
                data={summary.expenseCategoryBreakdown}
                subtitle="Largest first"
              />
            </Card>

            <Card>
              <T variant="heading" accessibilityRole="header" style={{ marginBottom: space.md }}>
                Alerts
              </T>
              {summary.alerts.length === 0 ? (
                <T variant="caption">
                  FinSight will flag possible duplicates and unusually large expenses here as you record them.
                </T>
              ) : (
                <View style={{ gap: space.sm }}>
                  {summary.alerts.slice(0, 5).map((a) => (
                    <Alert key={a.id} kind={alertKindFromType(a.type)} label={a.type}>
                      {a.message}
                    </Alert>
                  ))}
                </View>
              )}
              {/*
                The five shown here are read-only. Everything else — the rest
                of the list, and any way to clear one — lives on the alerts
                screen, which mobile previously had no route to at all.
              */}
              <Button
                title={summary.alerts.length > 5 ? `See all ${summary.alerts.length} alerts` : "See all alerts"}
                variant="ghost"
                onPress={() => navigation.navigate("Notifications")}
              />
            </Card>

            {/* Recency slot. */}
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: space.md }}>
                <T variant="heading" accessibilityRole="header">Recovery target</T>
                <T variant="caption">This month</T>
              </View>
              <RecoveryMeter data={summary.recoveryStatus} />
            </Card>
          </>
        )}
      </ScrollView>

      <AskFinSight
        visible={askOpen}
        onClose={() => setAskOpen(false)}
        businessProfileId={selected.id}
        module="Dashboard"
      />
    </Screen>
  );
}
