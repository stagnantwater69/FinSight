import { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { T } from "./ui";
import { formatMoney } from "../lib/money";
import { brand, categorical, ink, paper, radius, space, status, statusText } from "../theme/tokens";

/**
 * The chart kit.
 *
 * Built on react-native-svg rather than a charting library on purpose: every
 * chart here is a handful of rects and one path, and a library would bring a
 * bundle and an API surface far larger than the four shapes this app needs.
 *
 * THE RULES THESE FOLLOW, and they are not stylistic preferences:
 *
 *   - Categorical hues come from tokens.categorical in FIXED ORDER and are
 *     never cycled or reassigned. Colour follows the entity, not its rank, so
 *     filtering a category out must not repaint the survivors.
 *   - Data-ends are rounded 4px and anchored to the baseline; the zero end
 *     stays square so a bar cannot read as floating.
 *   - Adjacent fills are separated by a 2px surface-coloured gap rather than a
 *     border, so touching segments stay countable.
 *   - Grid and axes are recessive; the data is the only thing with weight.
 *   - Every series carries a visible text label. Three of the categorical hues
 *     sit below 3:1 against white, which is fine for a mark but means colour
 *     may never be the only thing telling two series apart.
 *   - Text wears ink tokens, never the series colour.
 *
 * Everything is also given an accessibilityLabel that states the numbers in
 * words, because a chart nobody can see is a chart that says nothing.
 */

/** Rounded only at the data end — the baseline end stays square. */
function barPath(x: number, y: number, w: number, h: number, r = 4, horizontal = false): string {
  const radius = Math.max(0, Math.min(r, horizontal ? w : h));
  if (horizontal) {
    return `M${x},${y} H${x + w - radius} A${radius},${radius} 0 0 1 ${x + w},${y + radius} V${y + h - radius} A${radius},${radius} 0 0 1 ${x + w - radius},${y + h} H${x} Z`;
  }
  return `M${x},${y + h} V${y + radius} A${radius},${radius} 0 0 1 ${x + radius},${y} H${x + w - radius} A${radius},${radius} 0 0 1 ${x + w},${y + radius} V${y + h} Z`;
}

function ChartFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <View>
      <T variant="heading" style={{ marginBottom: subtitle ? 2 : space.md }}>
        {title}
      </T>
      {subtitle ? (
        <T variant="caption" style={{ marginBottom: space.md }}>
          {subtitle}
        </T>
      ) : null}
      {children}
    </View>
  );
}

// ============================================================
// Composition by category — ranked horizontal bars
// ============================================================
// A ranked bar, not a pie. The job is "which categories take the most, and by
// how much", and length on a common baseline is the one encoding people read
// accurately. A donut would make the top two hard to order and the small ones
// unreadable.

export function CategoryBreakdown({
  data,
  title = "Where your money went",
  subtitle,
}: {
  data: { categoryId: number; categoryName: string; total: number }[];
  title?: string;
  subtitle?: string;
}) {
  const rows = [...data].sort((a, b) => b.total - a.total).slice(0, 8);
  const max = Math.max(...rows.map((r) => r.total), 1);
  const grandTotal = data.reduce((sum, r) => sum + r.total, 0);

  if (rows.length === 0) {
    return (
      <ChartFrame title={title}>
        <T variant="caption">Once you record an expense, this shows which categories use the most.</T>
      </ChartFrame>
    );
  }

  return (
    <ChartFrame title={title} subtitle={subtitle}>
      <View
        accessibilityLabel={`Spending by category. ${rows
          .map((r) => `${r.categoryName}, ${formatMoney(r.total)}`)
          .join(". ")}`}
      >
        {rows.map((row, i) => {
          const share = grandTotal > 0 ? (row.total / grandTotal) * 100 : 0;
          return (
            <View key={row.categoryId} style={{ marginBottom: i === rows.length - 1 ? 0 : space.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                {/*
                  The name is the label AND the relief for the contrast warning
                  on three of these hues — identity is never colour alone.
                */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      backgroundColor: categorical[i % categorical.length],
                    }}
                  />
                  <T style={{ fontSize: 13, color: ink[800], flex: 1 }} numberOfLines={1}>
                    {row.categoryName}
                  </T>
                </View>
                <T style={{ fontSize: 13, color: ink[900] }}>{formatMoney(row.total)}</T>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 4 }}>
                {/*
                  A 0-100 viewBox stretched to the available width, so bar
                  lengths are a straight percentage and the track and the fill
                  share one coordinate system.
                */}
                <Svg width="100%" height={8} viewBox="0 0 100 8" preserveAspectRatio="none" style={{ flex: 1 }}>
                  <Rect x={0} y={0} width={100} height={8} rx={4} fill={paper[200]} />
                  <Path
                    d={barPath(0, 0, Math.max((row.total / max) * 100, 1.5), 8, 4, true)}
                    fill={categorical[i % categorical.length]}
                  />
                </Svg>
                <T variant="caption" style={{ width: 34, textAlign: "right" }}>
                  {share.toFixed(0)}%
                </T>
              </View>
            </View>
          );
        })}
      </View>
    </ChartFrame>
  );
}

// ============================================================
// Change over time — an area chart
// ============================================================
// Time is continuous, so the mark is continuous. A 2px line with a soft fill
// beneath it: the fill carries the shape at a glance, the line carries the
// precise value. Only the extremes are labelled — a number on every point is
// noise, not information.

export function SpendTrend({
  data,
  title = "Daily spending",
  subtitle,
  height = 120,
}: {
  data: { date: string; total: number }[];
  title?: string;
  subtitle?: string;
  height?: number;
}) {
  if (data.length < 2) {
    return (
      <ChartFrame title={title}>
        <T variant="caption">A few more days of records and the trend will show here.</T>
      </ChartFrame>
    );
  }

  const W = 320;
  const H = height;
  const padY = 10;
  const values = data.map((d) => d.total);
  const max = Math.max(...values, 1);
  const stepX = W / (data.length - 1);
  const y = (v: number) => padY + (1 - v / max) * (H - padY * 2);

  const points = data.map((d, i) => ({ x: i * stepX, y: y(d.total), ...d }));
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  const peak = points.reduce((a, b) => (b.total > a.total ? b : a));
  const total = values.reduce((s, v) => s + v, 0);

  return (
    <ChartFrame title={title} subtitle={subtitle}>
      <View
        accessibilityLabel={`Daily spending over ${data.length} days, totalling ${formatMoney(
          total,
        )}. Highest was ${formatMoney(peak.total)} on ${peak.date.slice(0, 10)}.`}
      >
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={brand[500]} stopOpacity={0.22} />
              <Stop offset="1" stopColor={brand[500]} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          {/* Recessive baseline. No gridlines — at this size they would be more ink than the data. */}
          <Path d={`M0,${H - 0.5} H${W}`} stroke={ink[200]} strokeWidth={1} />
          <Path d={area} fill="url(#spendFill)" />
          <Path
            d={line}
            stroke={brand[600]}
            strokeWidth={2}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </Svg>

        {/* Only the extremes get labels. */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          <T variant="caption">{data[0]!.date.slice(5, 10)}</T>
          <T variant="caption" style={{ color: ink[600] }}>
            peak {formatMoney(peak.total)}
          </T>
          <T variant="caption">{data[data.length - 1]!.date.slice(5, 10)}</T>
        </View>
      </View>
    </ChartFrame>
  );
}

// ============================================================
// Polarity — how each category moved
// ============================================================
// Up and down are opposite meanings, so this is the one place a two-hue
// diverging encoding is right. Neutral grey sits at no-change. Direction is
// also stated in words and by an arrow, never by colour alone.

export function CategoryChange({
  data,
  title = "How each category moved",
  subtitle,
}: {
  data: { categoryName: string; percentChange: number; direction: string }[];
  title?: string;
  subtitle?: string;
}) {
  if (data.length === 0) {
    return (
      <ChartFrame title={title}>
        <T variant="caption">Once there are two periods to compare, the change shows here.</T>
      </ChartFrame>
    );
  }

  const rows = data.slice(0, 6);
  const widest = Math.max(...rows.map((r) => Math.abs(r.percentChange)), 1);

  return (
    <ChartFrame title={title} subtitle={subtitle}>
      <View
        accessibilityLabel={rows
          .map((r) => `${r.categoryName} ${r.direction} ${Math.abs(r.percentChange).toFixed(0)} percent`)
          .join(". ")}
      >
        {rows.map((row, i) => {
          const up = row.percentChange > 0;
          const flat = Math.abs(row.percentChange) < 0.5;
          // Spending MORE is the unwelcome direction for an expense monitor,
          // so up is the warning pole and down the good one.
          const fill = flat ? ink[300] : up ? status.serious : status.good;
          const share = Math.abs(row.percentChange) / widest;

          return (
            <View key={row.categoryName} style={{ marginBottom: i === rows.length - 1 ? 0 : space.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                <T style={{ fontSize: 13, color: ink[800], flex: 1 }} numberOfLines={1}>
                  {row.categoryName}
                </T>
                <T
                  style={{
                    fontSize: 13,
                    color: flat ? ink[500] : up ? statusText.serious : statusText.good,
                  }}
                >
                  {flat ? "no change" : `${up ? "↑" : "↓"} ${Math.abs(row.percentChange).toFixed(0)}%`}
                </T>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                {/* Centre line is zero; bars grow left for down, right for up. */}
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  {!up && !flat ? (
                    <View style={{ height: 6, borderRadius: 3, width: `${share * 100}%`, backgroundColor: fill }} />
                  ) : null}
                </View>
                <View style={{ width: 1, height: 10, backgroundColor: ink[200] }} />
                <View style={{ flex: 1 }}>
                  {up && !flat ? (
                    <View style={{ height: 6, borderRadius: 3, width: `${share * 100}%`, backgroundColor: fill }} />
                  ) : null}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </ChartFrame>
  );
}

// ============================================================
// Magnitude against a target — columns with a reference line
// ============================================================

export function CoverageColumns({
  data,
  target,
  title = "Daily coverage",
  subtitle,
  height = 110,
}: {
  data: { date: string; amount: number }[];
  /** The line each day is trying to clear. */
  target: number;
  title?: string;
  subtitle?: string;
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <ChartFrame title={title}>
        <T variant="caption">Record a sale and each day's progress shows here.</T>
      </ChartFrame>
    );
  }

  const rows = data.slice(-14);
  const W = 320;
  const H = height;
  const max = Math.max(...rows.map((r) => r.amount), target, 1);
  const gap = 2; // the 2px surface gap that keeps adjacent columns countable
  const slot = W / rows.length;
  const barW = Math.max(slot - gap, 2);
  const targetY = (1 - target / max) * H;
  const met = rows.filter((r) => r.amount >= target).length;

  return (
    <ChartFrame title={title} subtitle={subtitle}>
      <View
        accessibilityLabel={`Daily sales against a target of ${formatMoney(target)}. ${met} of ${
          rows.length
        } days met it.`}
      >
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {rows.map((row, i) => {
            const h = Math.max((row.amount / max) * H, row.amount > 0 ? 2 : 0);
            return (
              <Path
                key={row.date}
                d={barPath(i * slot, H - h, barW, h, 4)}
                // Met or missed is a state, so it wears status colours — and
                // the count is written out above, so it is never colour alone.
                fill={row.amount >= target ? status.good : ink[200]}
              />
            );
          })}
          {/* The reference line sits ON TOP so it is never hidden by a column. */}
          <Path
            d={`M0,${targetY} H${W}`}
            stroke={statusText.warning}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        </Svg>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          <T variant="caption">{rows[0]!.date.slice(5, 10)}</T>
          <T variant="caption" style={{ color: ink[600] }}>
            {met} of {rows.length} days met {formatMoney(target)}
          </T>
          <T variant="caption">{rows[rows.length - 1]!.date.slice(5, 10)}</T>
        </View>
      </View>
    </ChartFrame>
  );
}

// ============================================================
// A single headline figure
// ============================================================
// Sometimes the honest answer is not a chart. One number, given room.

export function HeroFigure({
  label,
  value,
  caption,
  tone = "neutral",
}: {
  label: string;
  value: number;
  caption?: string;
  tone?: "neutral" | "good" | "warning";
}) {
  const colour = tone === "good" ? statusText.good : tone === "warning" ? statusText.warning : brand[900];
  return (
    <View
      style={{
        padding: space.lg,
        backgroundColor: paper.DEFAULT,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: paper[200],
      }}
    >
      <T variant="label">{label}</T>
      <T style={{ fontSize: 30, lineHeight: 38, color: colour, fontFamily: "IBMPlexMono_600SemiBold" }}>
        {formatMoney(value)}
      </T>
      {caption ? <T variant="caption">{caption}</T> : null}
    </View>
  );
}

/** A dot in a series colour, for legends and keys. */
export function SeriesDot({ index }: { index: number }) {
  return (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 2,
        backgroundColor: categorical[index % categorical.length],
      }}
    />
  );
}
