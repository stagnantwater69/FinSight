import { useEffect, useRef, useState } from "react";
import { Animated, Easing, type LayoutChangeEvent } from "react-native";
import { useReducedMotion } from "../lib/useReducedMotion";

const SETTLE = Easing.bezier(0.16, 1, 0.3, 1);

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The selected fill of a segmented control, drawn once behind the segments
 * and glided to the new one on change, so a switch reads as one thing moving.
 *
 * `ready` stays false until the selected segment has been measured; until
 * then the segment paints its own fill, so the first frame is never empty.
 */
export function useSegmentHighlight(selectedIndex: number) {
  const reduceMotion = useReducedMotion();
  const [boxes, setBoxes] = useState<Record<number, Box>>({});
  const [ready, setReady] = useState(false);
  const x = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const height = useRef(new Animated.Value(0)).current;
  const target = boxes[selectedIndex];

  useEffect(() => {
    if (!target) return;
    const to = { x: target.x, y: target.y, width: target.width, height: target.height };
    if (!ready || reduceMotion) {
      x.setValue(to.x);
      y.setValue(to.y);
      width.setValue(to.width);
      height.setValue(to.height);
      setReady(true);
      return;
    }
    // Width and height cannot run on the native driver, so all four share the JS one.
    const animation = Animated.parallel(
      (["x", "y", "width", "height"] as const).map((key) =>
        Animated.timing({ x, y, width, height }[key], { toValue: to[key], duration: 280, easing: SETTLE, useNativeDriver: false }),
      ),
    );
    animation.start();
    return () => animation.stop();
  }, [target, ready, reduceMotion, x, y, width, height]);

  const onLayoutFor = (index: number) => (event: LayoutChangeEvent) => {
    const { x: bx, y: by, width: bw, height: bh } = event.nativeEvent.layout;
    setBoxes((prev) => {
      const old = prev[index];
      if (old && old.x === bx && old.y === by && old.width === bw && old.height === bh) return prev;
      return { ...prev, [index]: { x: bx, y: by, width: bw, height: bh } };
    });
  };

  const style = { position: "absolute" as const, left: x, top: y, width, height };
  return { ready, onLayoutFor, style };
}
