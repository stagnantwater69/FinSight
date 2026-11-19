import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import type { ViewStyle } from "react-native";
import { useReducedMotion } from "../lib/useReducedMotion";

const SETTLE = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * The filled part of a bar, growing to `percent` whenever the value changes,
 * so the eye reads "how much" before it reads the number. Reduced motion, and
 * a repeat render with the same value, just show the final width.
 */
export function GrowFill({ percent, style }: { percent: number; style?: ViewStyle }) {
  const reduceMotion = useReducedMotion();
  const to = Math.max(0, Math.min(100, percent));
  const width = useRef(new Animated.Value(reduceMotion ? to : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      width.setValue(to);
      return;
    }
    // Width can't use the native driver; one bar on the JS thread is fine.
    const animation = Animated.timing(width, { toValue: to, duration: 450, easing: SETTLE, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [to, reduceMotion, width]);

  return (
    <Animated.View
      style={[
        { height: "100%" },
        style,
        { width: width.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) },
      ]}
    />
  );
}
