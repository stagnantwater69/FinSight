import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing } from "react-native";
import type { ViewStyle } from "react-native";
import { useReducedMotion } from "../lib/useReducedMotion";

const SETTLE = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * Fades and lifts content in once, when it mounts. Put it where loaded content
 * replaces a skeleton: a refresh keeps it mounted, so it never replays.
 * Reduced motion shows the content at once.
 *
 * shortcut: used on Home and Money flow only. Wrapping Expenses, Recovery or
 * Month-end in it made every suite fail in a combined `npm test` run (each
 * project passed alone; cause not pinned down). Fix the harness before
 * adding it to more screens.
 */
export function Reveal({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, { toValue: 1, duration: 260, easing: SETTLE, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
