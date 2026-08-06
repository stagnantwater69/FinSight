import { useCallback, useRef, useState } from "react";
import { Dimensions, Modal, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, EmptyState, ErrorNote, Money, Screen, SetupProgress, StatTile, T } from "../components/ui";
import { HomeHeader } from "../components/HomeHeader";
import { QuickActions, type QuickAction } from "../components/QuickActions";
import { CashflowChart } from "../components/charts";
import { GreetingHero } from "../components/GreetingHero";
import { AskFinSightFab, FAB_CLEARANCE } from "../components/AskFinSightFab";
import { AskFinSight } from "../components/AskFinSight";
import { SpendingBreakdownCard } from "../components/SpendingBreakdownCard";
import { SkeletonBox, SkeletonDashboard } from "../components/Skeleton";
import { useBusinessProfiles } from "../context/BusinessProfileContext";
import { api, errorMessage } from "../lib/api";
import { brand, ink, paper, radius, space, statusText, TAP } from "../theme/tokens";
import type { CashflowGranularity, DashboardCashflow, DashboardSummary } from "../lib/types";

/** The dashboard summary (available funds, sales, expenses) is always this month — the period selector was removed. */
const SUMMARY_PERIOD_DAYS = 30;

const GRANULARITY_OPTIONS: { label: string; value: CashflowGranularity }[] = [
  { label: "Daily", value: "daily" },
  { label: "Monthly", value: "monthly" },
];

/**
 * A money-in or money-out figure, sitting in the reference layout's twin-card
 * slot. Colour carries the direction — brand tint for money coming in, a
 * warm/rose tint for money going out — same tint vocabulary `Alert` already
 * uses for its surfaces, so this isn't a new colour idea, just a new place it
 * appears.
 */
function FlowCard({
  label,
  value,
  sublabel,
  direction,
}: {
  label: string;
  value: number;
  sublabel: string;
  direction: "in" | "out";
}) {
  const isIn = direction === "in";
  return (
    <Card
      style={{
        flex: 1,
        minWidth: 150,
        backgroundColor: isIn ? brand[50] : "#fef2f2",
        borderColor: isIn ? brand[200] : "#fecaca",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <T
          variant="label"
          style={{ textTransform: "uppercase", letterSpacing: 0.4, color: isIn ? brand[700] : statusText.critical }}
        >
          {label}
        </T>
        <Ionicons
          name={isIn ? "arrow-down-circle" : "arrow-up-circle"}
          size={16}
          color={isIn ? brand[600] : statusText.critical}
        />
      </View>
      <Money value={value} size={20} weight="semibold" color={isIn ? brand[900] : statusText.critical} style={{ marginTop: 4 }} />
      <T variant="caption" style={{ marginTop: 2 }}>
        {sublabel}
      </T>
    </Card>
  );
}

/**
 * The cashflow chart's own range control — a small "Daily ⌄" chip that opens
 * a two-option picker, rather than a full picker screen. Lives next to the
 * chart's title (via `ChartFrame`'s `action` slot) rather than in the
 * screen's own header, because it belongs to this one chart and nothing else
 * on Home reads differently for it.
 *
 * Anchored, not centred: the menu is measured off the chip itself with
 * `measureInWindow` and appears directly under it, and the backdrop carries
 * no dim tint. `Modal` is used only for the layer it renders on and the
 * outside-tap-to-close it gives for free — visually this reads as a regular
 * dropdown attached to its trigger, not a dialog.
 */
function GranularityDropdown({
  value,
  onChange,
}: {
  value: CashflowGranularity;
  onChange: (v: CashflowGranularity) => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const anchorRef = useRef<View>(null);
  const current = GRANULARITY_OPTIONS.find((o) => o.value === value)!;

  return (
    <View ref={anchorRef} collapsable={false}>
      <Pressable
        onPress={() => {
          anchorRef.current?.measureInWindow((x, y, width, height) => {
            setAnchor({ top: y + height + 4, right: Math.max(Dimensions.get("window").width - (x + width), 0) });
            setOpen(true);
          });
        }}
        accessibilityRole="button"
        accessibilityLabel={`${current.label} view. Change cashflow range.`}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: space.sm,
          paddingVertical: 6,
          borderRadius: radius.full,
          borderWidth: 1,
          borderColor: ink[200],
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <T style={{ fontSize: 12, color: ink[700] }}>{current.label}</T>
        <Ionicons name="chevron-down" size={14} color={ink[500]} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1 }}>
          <Pressable
            style={{ flex: 1 }}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
          {anchor ? (
            <View
              style={{
                position: "absolute",
                top: anchor.top,
                right: anchor.right,
                backgroundColor: paper.DEFAULT,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: paper[200],
                overflow: "hidden",
                minWidth: 130,
                shadowColor: ink[900],
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.12,
                shadowRadius: 8,
                elevation: 6,
              }}
            >
              {GRANULARITY_OPTIONS.map((o) => (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: o.value === value }}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: space.md,
                    paddingHorizontal: space.md,
                    minHeight: TAP - 4,
                    backgroundColor: pressed ? paper[100] : "transparent",
                  })}
                >
                  <T style={{ fontSize: 14, color: ink[900] }}>{o.label}</T>
                  {o.value === value ? <Ionicons name="checkmark" size={16} color={brand[600]} /> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

export function DashboardScreen({ navigation }: any) {
  const { selected, profiles, categories, error: profilesError, refresh: refreshProfiles, selectProfile } =
    useBusinessProfiles();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [cashflow, setCashflow] = useState<DashboardCashflow | null>(null);
  const [cashflowGranularity, setCashflowGranularity] = useState<CashflowGranularity>("daily");
  const [loading, setLoading] = useState(true);
  const [cashflowLoading, setCashflowLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);

  /*
   * Split from the cashflow fetch on purpose. They used to be one
   * Promise.all, which meant toggling the Daily/Monthly dropdown re-fetched
   * the summary too and dropped the whole screen back to the full skeleton
   * for a control that only the cashflow card owns.
   */
  const loadSummary = useCallback(async () => {
    if (!selected) return;
    setError(null);
    try {
      setSummary(
        await api.get<DashboardSummary>("/dashboard/summary", {
          businessProfileId: selected.id,
          periodDays: SUMMARY_PERIOD_DAYS,
        })
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [selected?.id]);

  const loadCashflow = useCallback(async () => {
    if (!selected) return;
    setCashflowLoading(true);
    try {
      setCashflow(
        await api.get<DashboardCashflow>("/dashboard/cashflow", {
          businessProfileId: selected.id,
          granularity: cashflowGranularity,
        })
      );
    } catch {
      // The cashflow card falls back to its own empty state below; a second
      // error banner next to the page-level one for the summary would say
      // the same thing twice for what is, from here, a minor degradation.
    } finally {
      setCashflowLoading(false);
    }
  }, [selected?.id, cashflowGranularity]);

  // Refetch on focus so a record added on another tab is reflected when the
  // user comes back, rather than showing a stale figure. Two separate
  // effects so a granularity change (which only recreates `loadCashflow`)
  // reloads just the chart, not the whole screen.
  useFocusEffect(useCallback(() => { loadSummary(); }, [loadSummary]));
  useFocusEffect(useCallback(() => { loadCashflow(); }, [loadCashflow]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadSummary(), loadCashflow()]);
    setRefreshing(false);
  }, [loadSummary, loadCashflow]);

  if (!selected) {
    return (
      <Screen safeTop>
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
  const unreadCount = summary ? summary.alerts.filter((a) => !a.readStatus).length : 0;

  const quickActions: QuickAction[] = [
    {
      key: "scan",
      label: "Scan receipt",
      icon: "scan-outline",
      onPress: () => navigation.navigate("Records", { screen: "ScanReceipt", params: { autoLaunch: true } }),
    },
    {
      key: "addExpense",
      label: "Add expense",
      icon: "wallet-outline",
      onPress: () => navigation.navigate("Records", { screen: "AddExpense" }),
    },
    {
      key: "addSale",
      label: "Add sale",
      icon: "cash-outline",
      onPress: () => navigation.navigate("Records", { screen: "AddSales" }),
    },
    {
      key: "categories",
      label: "Categories",
      icon: "pricetags-outline",
      onPress: () => navigation.navigate("Records", { screen: "Categories" }),
    },
    {
      key: "importCsv",
      label: "Import CSV",
      icon: "cloud-upload-outline",
      onPress: () => navigation.navigate("Records", { screen: "ImportCsv" }),
    },
    {
      key: "insights",
      label: "Insights",
      icon: "bar-chart-outline",
      onPress: () => navigation.navigate("Insights"),
    },
    {
      key: "alerts",
      label: "Alerts",
      icon: "notifications-outline",
      onPress: () => navigation.navigate("Notifications"),
    },
    {
      key: "businesses",
      label: "Businesses",
      icon: "storefront-outline",
      onPress: () => navigation.navigate("More", { screen: "BusinessProfiles" }),
    },
  ];

  return (
    <Screen safeTop>
      <ScrollView
        // The FAB floats over this list, so the scroll has to end far enough
        // up that it can never cover the last card.
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl + FAB_CLEARANCE, gap: space.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand[600]} />}
      >
        <HomeHeader
          selected={selected}
          profiles={profiles}
          onSwitch={selectProfile}
          unreadCount={unreadCount}
          onBellPress={() => navigation.navigate("Notifications")}
        />

        {/*
          Greets the person, not the business — so it sits under the business
          switcher rather than above it, where it would look like a label for
          whichever profile happens to be selected.

          `summary` is passed even though the screen may still be loading: the
          date, the greeting and Fin all render immediately either way, and only
          Fin's one-line note waits on this — as a skeleton inside the panel, so
          the card does not change height when the figures land.
        */}
        <GreetingHero summary={loading ? null : summary} />

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
              Serial Position Effect — Fin's note in the greeting above already
              answered "is anything wrong" before a single figure is read;
              available funds takes the primacy slot here, the figure owners
              check most.
            */}
            <StatTile label="Available business funds" value={summary.overview.availableFunds} emphasis />

            <View style={{ flexDirection: "row", gap: space.md }}>
              <FlowCard label="Sales" value={summary.overview.totalSalesReference} sublabel="This month" direction="in" />
              <FlowCard label="Expenses" value={summary.overview.totalExpenses} sublabel="This month" direction="out" />
            </View>

            <QuickActions actions={quickActions} />

            <Card>
              {cashflowLoading && !cashflow ? (
                // Only on the very first load — a granularity toggle refetches
                // in the background and swaps the chart in when it lands,
                // rather than blanking a chart that is already on screen.
                <SkeletonBox height={200} />
              ) : (
                <CashflowChart
                  data={cashflow?.points ?? []}
                  granularity={cashflowGranularity}
                  subtitle={cashflowGranularity === "monthly" ? "Last 6 months" : "Last 7 days"}
                  action={<GranularityDropdown value={cashflowGranularity} onChange={setCashflowGranularity} />}
                />
              )}
            </Card>

            <SpendingBreakdownCard data={summary.expenseCategoryBreakdown} />
          </>
        )}
      </ScrollView>

      {/*
        Outside the ScrollView so it stays put while the page moves under it.
        Bottom-right rather than centred: the raised Scan button in the tab bar
        pokes up into this corner of the screen, and two round buttons stacked
        on the same axis would read as one control.
      */}
      <AskFinSightFab onPress={() => setAskOpen(true)} />

      <AskFinSight
        visible={askOpen}
        onClose={() => setAskOpen(false)}
        businessProfileId={selected.id}
        module="Dashboard"
      />
    </Screen>
  );
}
