import { View } from "react-native";
import { Card, T } from "./ui";
import { brand, ink, space, statusText } from "../theme/tokens";
import { formatMoney } from "../lib/money";
import type { DashboardSummary } from "../lib/types";

/**
 * The screen in one sentence.
 *
 * Someone opening this at a counter has a few seconds and one hand. The tiles
 * and charts below answer questions they came with; this answers the one they
 * did not think to ask — "is anything wrong right now" — before they have to
 * read a single figure.
 *
 * COMPOSED, NOT GENERATED. Every clause is assembled here from numbers already
 * on screen, so it costs nothing, works offline, and cannot say anything the
 * data does not. Ask FinSight is one tap away for the questions that genuinely
 * need a model — putting AI prose in the first card would mean the first thing
 * an owner reads each morning is the least verifiable thing on the screen.
 */
export function AtAGlance({
  summary,
  onAsk,
}: {
  summary: DashboardSummary;
  onAsk?: () => void;
}) {
  const { overview, recoveryStatus, expenseCategoryBreakdown, recordsNeedingReview, alerts } = summary;

  const topCategory = [...expenseCategoryBreakdown].sort((a, b) => b.total - a.total)[0];
  const spent = overview.totalExpenses;
  const remaining = recoveryStatus?.remainingTarget ?? 0;
  const daysLeft = recoveryStatus?.remainingOperatingDays ?? 0;

  /*
   * Ordered by what would make an owner act, not by what is easiest to say.
   * Money that needs attention comes before money that is merely interesting,
   * and nothing is mentioned twice.
   */
  const lines: { text: string; tone: "plain" | "warn" }[] = [];

  if (spent === 0) {
    lines.push({ text: "Nothing recorded in this period yet.", tone: "plain" });
  } else if (topCategory) {
    const share = spent > 0 ? Math.round((topCategory.total / spent) * 100) : 0;
    lines.push({
      text: `${topCategory.categoryName} is your biggest cost at ${formatMoney(topCategory.total)}, about ${share}% of everything you spent.`,
      tone: "plain",
    });
  }

  if (remaining > 0 && daysLeft > 0) {
    lines.push({
      text: `You need ${formatMoney(remaining)} more this month — about ${formatMoney(
        remaining / daysLeft,
      )} a day across your ${daysLeft} remaining operating day${daysLeft === 1 ? "" : "s"}.`,
      tone: "plain",
    });
  } else if (remaining <= 0 && recoveryStatus) {
    lines.push({ text: "You have already covered this month's expected expenses.", tone: "plain" });
  }

  if (recordsNeedingReview > 0) {
    lines.push({
      text: `${recordsNeedingReview} record${recordsNeedingReview === 1 ? "" : "s"} need${
        recordsNeedingReview === 1 ? "s" : ""
      } a second look.`,
      tone: "warn",
    });
  }

  const unread = alerts.filter((a) => !a.readStatus).length;
  if (unread > 0) {
    lines.push({
      text: `${unread} alert${unread === 1 ? "" : "s"} you haven't read.`,
      tone: "warn",
    });
  }

  if (lines.length === 0) return null;

  return (
    <Card emphasis>
      <T variant="label" style={{ textTransform: "uppercase", letterSpacing: 0.5, color: brand[700] }}>
        At a glance
      </T>

      <View style={{ marginTop: space.sm, gap: 6 }}>
        {lines.map((line, i) => (
          <View key={i} style={{ flexDirection: "row", gap: space.sm }}>
            <T
              style={{
                fontSize: 13,
                lineHeight: 19,
                color: line.tone === "warn" ? statusText.warning : ink[800],
              }}
            >
              {line.tone === "warn" ? "⚠" : "•"}
            </T>
            <T
              style={{
                flex: 1,
                fontSize: 13,
                lineHeight: 19,
                color: line.tone === "warn" ? statusText.warning : ink[800],
              }}
            >
              {line.text}
            </T>
          </View>
        ))}
      </View>

      {onAsk ? (
        <T
          onPress={onAsk}
          accessibilityRole="button"
          style={{ marginTop: space.md, fontSize: 13, color: brand[700] }}
        >
          Ask FinSight about this →
        </T>
      ) : null}
    </Card>
  );
}
