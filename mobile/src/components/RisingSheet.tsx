import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Platform, useWindowDimensions } from "react-native";
import { useReducedMotion } from "../lib/useReducedMotion";

/** Fast start, long settle: the same curve the web app's entrances use. */
const SETTLE = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * The moving part of a bottom sheet or dialog, placed inside the Modal's
 * dimmed backdrop. The Modal itself fades (`animationType="fade"`), so the
 * dim settles in place while only the panel rises. With `animationType="slide"`
 * the dim slid up from the bottom of the screen along with the panel.
 *
 * Closing is the Modal's own quick fade: the owner already decided, so
 * nothing is replayed on the way out.
 */
export function RisingSheet({ children, dialog = false }: { children: ReactNode; dialog?: boolean }) {
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: dialog ? 280 : 360,
      easing: SETTLE,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduceMotion, dialog]);

  const style = dialog
    ? {
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
        ],
      }
    : { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height * 0.6, 0] }) }] };

  return (
    <Animated.View style={[{ flex: 1, justifyContent: dialog ? "center" : "flex-end" }, style]}>
      {children}
    </Animated.View>
  );
}
