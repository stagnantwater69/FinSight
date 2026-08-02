import { View } from "react-native";
import { Money, T } from "./ui";
import { ACCENT, ink, paper, radius, space, status, statusText } from "../theme/tokens";
import type { RecoveryTargets } from "../lib/types";

/**
 * The Recovery Meter — the product's signature component, and one of only two
 * places the amber accent appears (the other being primary CTAs).
 *
 * Amber marks the ADJUSTED DAILY TARGET only: the number that answers "what
 * does today need to look like?". The progress bars stay on the status palette,
 * because those encode good/bad and amber must not start meaning "warning".
 *
 * Renders purely from the backend's computed object — no arithmetic here, so
 * Dashboard and the Recovery screen cannot drift apart, and neither can mobile
 * and web.
 */
export function RecoveryMeter({ data }: { data: RecoveryTargets }) {
  const monthRatio = Math.min(data.monthCoveragePercent / 100, 1);
  const monthFill = data.onTrack ? status.good : status.critical;
  const monthInk = data.onTrack ? statusText.good : statusText.critical;

  const todayFill =
    data.todaysStatus === "below" ? status.critical : data.todaysStatus === "at" ? status.warning : status.good;
  const todayInk =
    data.todaysStatus === "below"
      ? statusText.critical
      : data.todaysStatus === "at"
        ? statusText.warning
        : statusText.good;
  const todayRatio =
    data.todaysTarget > 0 ? Math.min(data.todaysSales / data.todaysTarget, 1) : data.todaysSales > 0 ? 1 : 0;

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.sm }}>
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: monthInk,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <T style={{ color: "#fff", fontSize: 11 }}>{data.onTrack ? "✓" : "!"}</T>
        </View>
        <T style={{ color: monthInk, fontSize: 14 }}>
          {data.onTrack ? "On pace for the month" : "Behind pace for the month"}
        </T>
      </View>

      <Bar ratio={monthRatio} color={monthFill} height={12} label="Month-to-date coverage" />
      <T variant="caption" style={{ marginTop: 6 }}>
        <Money value={data.salesThisMonth} size={12} weight="regular" color={ink[500]} /> of{" "}
        <Money value={data.expectedMonthlyExpenses} size={12} weight="regular" color={ink[500]} /> needed this month (
        {data.monthCoveragePercent.toFixed(0)}%)
      </T>

      <View style={{ flexDirection: "row", gap: space.md, marginTop: space.lg }}>
        <View style={{ flex: 1 }}>
          <T variant="caption">Daily needed target</T>
          <Money value={data.dailyNeededTarget} size={15} style={{ marginTop: 2 }} />
        </View>
        {/* The accent moment. */}
        <View style={{ flex: 1, backgroundColor: ACCENT.surface, borderRadius: radius.sm, padding: space.sm }}>
          <T variant="caption" style={{ color: ACCENT.text }}>
            Adjusted daily target
          </T>
          <Money value={data.adjustedDailyTarget} size={15} weight="semibold" color={ACCENT.text} style={{ marginTop: 2 }} />
        </View>
      </View>

      <T variant="caption" style={{ marginTop: 6 }}>
        <Money value={data.remainingTarget} size={12} weight="regular" color={ink[500]} /> still needed across about{" "}
        {data.remainingOperatingDays} remaining operating day{data.remainingOperatingDays === 1 ? "" : "s"}.
      </T>

      <View style={{ marginTop: space.lg, borderTopWidth: 1, borderTopColor: paper[200], paddingTop: space.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
          <T variant="caption">Today</T>
          <T style={{ color: todayInk, fontSize: 12 }}>
            {data.todaysStatus === "at" ? (
              "Reached target"
            ) : (
              <>
                <Money value={Math.abs(data.todaysGap)} size={12} weight="regular" color={todayInk} />{" "}
                {data.todaysStatus} target
              </>
            )}
          </T>
        </View>
        <Bar ratio={todayRatio} color={todayFill} height={8} label="Today's progress" />
        <T variant="caption" style={{ marginTop: 6 }}>
          <Money value={data.todaysSales} size={12} weight="regular" color={ink[500]} /> recorded of{" "}
          <Money value={data.todaysTarget} size={12} weight="regular" color={ink[500]} /> needed today
        </T>
      </View>
    </View>
  );
}

function Bar({ ratio, color, height, label }: { ratio: number; color: string; height: number; label: string }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
      style={{ height, backgroundColor: ink[100], borderRadius: height / 2, overflow: "hidden" }}
    >
      <View style={{ width: `${ratio * 100}%`, height: "100%", backgroundColor: color, borderRadius: height / 2 }} />
    </View>
  );
}
