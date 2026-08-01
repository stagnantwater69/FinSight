import { useEffect, useRef } from "react";
import { Animated, View, ViewStyle } from "react-native";
import { paper, radius, space } from "../theme/tokens";

export function SkeletonBox({
  width,
  height,
  borderRadius = radius.md,
  style,
}: {
  width?: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width ?? "100%",
          height,
          borderRadius,
          backgroundColor: paper[200],
          opacity,
        },
        style,
      ]}
    />
  );
}

export function SkeletonCard({ style }: { style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          backgroundColor: paper.DEFAULT,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: paper[200],
          padding: space.lg,
          gap: space.md,
        },
        style,
      ]}
    >
      <SkeletonBox width="40%" height={16} />
      <SkeletonBox width="75%" height={26} />
      <SkeletonBox width="60%" height={14} />
    </View>
  );
}

export function SkeletonDashboard() {
  return (
    <View style={{ gap: space.lg }}>
      <SkeletonCard />
      <View style={{ flexDirection: "row", gap: space.md }}>
        <SkeletonCard style={{ flex: 1 }} />
        <SkeletonCard style={{ flex: 1 }} />
      </View>
      <SkeletonCard style={{ height: 180 }} />
      <SkeletonCard style={{ height: 140 }} />
    </View>
  );
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <View style={{ gap: space.sm }}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            backgroundColor: paper.DEFAULT,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: paper[200],
            padding: space.lg,
            gap: space.xs,
          }}
        >
          <SkeletonBox width="60%" height={16} />
          <SkeletonBox width="40%" height={12} />
        </View>
      ))}
    </View>
  );
}

