import { useEffect, useRef } from "react";
import { Animated, Easing, View, type ViewStyle } from "react-native";
import { Card } from "./ui";
import { paper, radius, space } from "../theme/tokens";

/**
 * Placeholders shaped like the thing that is coming.
 *
 * A centred spinner tells the owner "wait" and nothing else, then the layout
 * jumps when content lands. A skeleton in the SHAPE of the answer says what is
 * arriving and reserves its space, so the screen settles instead of leaping —
 * which is why these mirror each screen's real layout rather than being a
 * generic grey box.
 *
 * The pulse is opacity only, driven by the JS-side Animated API with
 * useNativeDriver. Opacity is one of the properties the native driver can take
 * off the JS thread, so the shimmer keeps running smoothly even while the
 * response is being parsed — the exact moment a JS-thread animation would
 * stutter and undo the point of having one.
 */
function usePulse() {
  const value = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0.4,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    // Stopped on unmount: a loop left running holds a timer open and keeps the
    // component alive after the real content has replaced it.
    return () => loop.stop();
  }, [value]);

  return value;
}

/** One grey bar. Width is a percentage so rows look ragged, like real text. */
export function SkeletonLine({
  width = "100%",
  height = 12,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  style?: ViewStyle;
}) {
  const opacity = usePulse();
  return (
    <Animated.View
      // Decorative only — a screen reader should announce the loading state
      // once, from the container, not once per bar.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radius.sm, backgroundColor: paper[200], opacity },
        style,
      ]}
    />
  );
}

/** A card-shaped placeholder: a short label over a longer value. */
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <Card>
      <SkeletonLine width="40%" height={10} />
      <SkeletonLine width="70%" height={20} style={{ marginTop: space.sm }} />
      {Array.from({ length: Math.max(0, lines - 2) }).map((_, i) => (
        <SkeletonLine key={i} width="90%" height={12} style={{ marginTop: space.sm }} />
      ))}
    </Card>
  );
}

/** Two tiles side by side, matching the dashboard's stat row. */
function SkeletonTileRow() {
  return (
    <View style={{ flexDirection: "row", gap: space.md }}>
      <Card style={{ flex: 1 }}>
        <SkeletonLine width="60%" height={10} />
        <SkeletonLine width="80%" height={20} style={{ marginTop: space.sm }} />
      </Card>
      <Card style={{ flex: 1 }}>
        <SkeletonLine width="60%" height={10} />
        <SkeletonLine width="80%" height={20} style={{ marginTop: space.sm }} />
      </Card>
    </View>
  );
}

/** A chart-shaped placeholder: a title, then rows of bar-and-label. */
export function SkeletonChart({ rows = 4 }: { rows?: number }) {
  return (
    <Card>
      <SkeletonLine width="45%" height={14} />
      <View style={{ marginTop: space.lg, gap: space.md }}>
        {Array.from({ length: rows }).map((_, i) => (
          <View key={i}>
            <SkeletonLine width={`${70 - i * 8}%` as `${number}%`} height={10} />
            <SkeletonLine height={8} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>
    </Card>
  );
}

/**
 * The dashboard's own shape: headline figure, two tiles, a chart, a list.
 *
 * Deliberately specific rather than reusable — the value of a skeleton is that
 * it matches what replaces it, and a generic one that does not would just be a
 * spinner with extra steps.
 */
export function SkeletonDashboard() {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading your dashboard"
      style={{ gap: space.lg }}
    >
      <Card>
        <SkeletonLine width="50%" height={10} />
        <SkeletonLine width="65%" height={28} style={{ marginTop: space.sm }} />
      </Card>
      <SkeletonTileRow />
      <SkeletonChart />
      <SkeletonCard lines={3} />
    </View>
  );
}

/** A list of record cards. */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading records" style={{ gap: space.sm }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
            <View style={{ flex: 1 }}>
              <SkeletonLine width="80%" height={14} />
              <SkeletonLine width="50%" height={10} style={{ marginTop: 6 }} />
            </View>
            <SkeletonLine width={70} height={16} />
          </View>
        </Card>
      ))}
    </View>
  );
}
