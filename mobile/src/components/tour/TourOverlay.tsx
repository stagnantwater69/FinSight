import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Modal,
  Pressable,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, T } from "../ui";
import { brand, ink, paper, radius, space, TAP } from "../../theme/tokens";
import { useReducedMotion } from "../../lib/useReducedMotion";
import { useTourOptional } from "../../context/TourContext";
import { nextStepIndex, previousStepIndex, stepPosition, TOUR_STEPS } from "./steps";
import { measureTourTarget, stepIsOnScreen, type TourRect } from "./targets";
import { TourMascot } from "./TourMascot";

/**
 * The tour's overlay: dim, spotlight, card, and Fin.
 *
 * Rendered only by TourProvider while a run is active.
 *
 * HOW THE SPOTLIGHT WORKS. Web punches a hole in the dim with a huge
 * box-shadow spread; React Native has no such trick and no CSS mask. The
 * robust native equivalent is FOUR DIM PANELS — above, below, left and right
 * of the measured rectangle — leaving the target area untouched, plus a ring
 * drawn around it. No SVG, no mask, no extra dependency, and it degrades
 * cleanly: when there is no rectangle the four panels collapse into one
 * full-screen dim behind a centered card.
 *
 * The target is measured with `measureInWindow` through the registry in
 * targets.ts, because that is the only coordinate space a full-screen Modal
 * shares with the app underneath it.
 *
 * A MISSING TARGET NEVER STRANDS THE TOUR. Measurement is retried for about a
 * second (a tab bar item mid-transition, a card still laying out); if it never
 * lands, the step is skipped IN THE DIRECTION OF TRAVEL — forward for Next,
 * backward for Back, and forward when there is nothing behind. Same rule web
 * follows, and the reason the step counter counts only what is showable.
 *
 * TOUCHES. The modal covers the app, so nothing underneath is interactive
 * while a step is up — including inside the cut-out, which is a visual
 * emphasis and not a live control. That matches web, where a transparent layer
 * blocks the page.
 *
 * MOTION. The card cross-fades between steps, and the modal itself fades in.
 * Both are dropped entirely when the phone asks for reduced motion; the card
 * is placed at its final opacity rather than animated to it.
 */

/** Breathing room around the spotlighted element, and the card's clearance. */
const PAD = 8;
const GAP = space.md;
/** Retry budget for a target that has not laid out yet: ~1s at 8 x 120ms. */
const MEASURE_TRIES = 8;
const MEASURE_INTERVAL_MS = 120;
/** The scrim. ink[900] at the same weight the app's other modal backdrops use. */
const SCRIM = "rgba(26,32,34,0.55)";

export function TourOverlay() {
  const tour = useTourOptional();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  const stepIndex = tour?.stepIndex ?? 0;
  const step = TOUR_STEPS[stepIndex] ?? TOUR_STEPS[0]!;

  const [rect, setRect] = useState<TourRect | null>(null);
  /**
   * The card's own height, measured rather than guessed: it changes with the
   * length of the step's copy and with the system font-size setting, and a
   * hard-coded estimate is how a card ends up half off the bottom of a small
   * phone at large type. The initial value only governs the first frame.
   */
  const [cardHeight, setCardHeight] = useState(240);
  /** Which way the owner is moving, so a dead target is skipped that way. */
  const directionRef = useRef<1 | -1>(1);
  const fade = useRef(new Animated.Value(1)).current;

  const next = tour?.next;
  const back = tour?.back;

  // ---- resolve the step's target, retrying briefly for a late layout ----
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setRect(null);

    const key = step.target;
    if (!key) return;

    let tries = 0;
    const attempt = () => {
      void measureTourTarget(key).then((measured) => {
        if (cancelled) return;
        if (measured) {
          setRect(measured);
          return;
        }
        if (++tries >= MEASURE_TRIES) {
          // Nothing to point at. Move on rather than sit on a dimmed screen
          // describing an element that is not there.
          const hasPrevious = previousStepIndex(TOUR_STEPS, stepIndex, stepIsOnScreen) !== null;
          if (directionRef.current === -1 && hasPrevious) back?.();
          else next?.();
          return;
        }
        timer = setTimeout(attempt, MEASURE_INTERVAL_MS);
      });
    };
    attempt();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [stepIndex, step.target, next, back]);

  // ---- announce each step, since the card's content swaps in place ----
  const { position, total } = stepPosition(TOUR_STEPS, stepIndex, stepIsOnScreen);
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      `Step ${position} of ${total}. ${step.title}. ${step.body}`,
    );
    // Announced on a step change, not on every re-measure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // ---- cross-fade the card between steps ----
  useEffect(() => {
    if (reduceMotion) {
      fade.setValue(1);
      return;
    }
    fade.setValue(0);
    const animation = Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [stepIndex, reduceMotion, fade]);

  if (!tour) return null;

  const isLast = nextStepIndex(TOUR_STEPS, stepIndex, stepIsOnScreen) === null;
  const canGoBack = previousStepIndex(TOUR_STEPS, stepIndex, stepIsOnScreen) !== null;

  const goNext = () => {
    directionRef.current = 1;
    tour.next();
  };
  const goBack = () => {
    directionRef.current = -1;
    tour.back();
  };

  /*
   * Where the card sits.
   *
   * Below the spotlight when the spotlight is in the top half of the screen,
   * above it when it is in the bottom half (the tab bar, the Ask button) —
   * which is the whole of the placement problem on a phone. Web flips between
   * four sides because a desktop tooltip has room to; a phone-width card is
   * effectively full width, so only "which end" is a real choice.
   */
  const spotlightBottom = rect ? rect.y + rect.height : 0;
  const cardAtTop = !!rect && spotlightBottom > height * 0.5;

  /** Kept inside the safe area at both ends, whatever the card measured. */
  const clampCardTop = (top: number) =>
    Math.max(
      insets.top + space.sm,
      Math.min(top, height - insets.bottom - space.sm - cardHeight),
    );

  const panels = rect
    ? [
        { top: 0, left: 0, width, height: Math.max(rect.y - PAD, 0) },
        {
          top: Math.min(spotlightBottom + PAD, height),
          left: 0,
          width,
          height: Math.max(height - spotlightBottom - PAD, 0),
        },
        {
          top: Math.max(rect.y - PAD, 0),
          left: 0,
          width: Math.max(rect.x - PAD, 0),
          height: rect.height + PAD * 2,
        },
        {
          top: Math.max(rect.y - PAD, 0),
          left: Math.min(rect.x + rect.width + PAD, width),
          width: Math.max(width - rect.x - rect.width - PAD, 0),
          height: rect.height + PAD * 2,
        },
      ]
    : [];

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType={reduceMotion ? "none" : "fade"}
      // Android's back button. Treated as the visible Skip control rather than
      // ignored — a modal that will not close to Back reads as a hang — and
      // the tour is one row in More away from being replayed.
      onRequestClose={() => tour.stop("skipped")}
    >
      <View
        style={{ flex: 1 }}
        accessibilityViewIsModal
        accessibilityLabel="Product tour"
      >
        {/*
          The dim. One full-screen panel when there is nothing to spotlight
          (the welcome and completion cards, and the moment before a target
          measures — so the screen never flashes bright between steps), four
          panels around the target when there is.
        */}
        {rect ? (
          panels.map((panel, i) => (
            <View
              key={i}
              pointerEvents="none"
              style={{ position: "absolute", backgroundColor: SCRIM, ...panel }}
            />
          ))
        ) : (
          <View
            pointerEvents="none"
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: SCRIM }}
          />
        )}

        {rect ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: rect.y - PAD,
              left: rect.x - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
              borderRadius: radius.md,
              borderWidth: 2,
              borderColor: brand[400],
            }}
          />
        ) : null}

        <Animated.View
          style={{
            position: "absolute",
            left: space.lg,
            right: space.lg,
            opacity: fade,
            ...(rect
              ? cardAtTop
                ? { top: clampCardTop(rect.y - PAD - GAP - cardHeight) }
                : { top: clampCardTop(spotlightBottom + PAD + GAP) }
              : { top: 0, bottom: 0, justifyContent: "center" }),
          }}
        >
          <View
            onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
            style={{
              backgroundColor: paper.DEFAULT,
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: paper[200],
              padding: space.lg,
              shadowColor: ink[900],
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.18,
              shadowRadius: 12,
              elevation: 8,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md }}>
              <TourMascot mascot={step.mascot} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
                  <T accessibilityRole="header" variant="title" style={{ flex: 1 }}>
                    {step.title}
                  </T>
                  <Pressable
                    onPress={() => tour.stop("skipped")}
                    accessibilityRole="button"
                    accessibilityLabel="Close the tour"
                    hitSlop={12}
                    style={({ pressed }) => ({
                      width: TAP - 12,
                      height: TAP - 12,
                      marginTop: -space.xs,
                      marginRight: -space.xs,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: radius.full,
                      backgroundColor: pressed ? paper[100] : "transparent",
                    })}
                  >
                    <Ionicons name="close" size={20} color={ink[500]} />
                  </Pressable>
                </View>
                <T style={{ marginTop: space.xs }}>{step.body}</T>
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.sm,
                marginTop: space.lg,
              }}
            >
              <T variant="caption" accessibilityLabel={`Step ${position} of ${total}`}>
                {position} of {total}
              </T>
              <Pressable
                onPress={() => tour.stop("skipped")}
                accessibilityRole="button"
                accessibilityLabel="Skip the tour"
                hitSlop={12}
                style={({ pressed }) => ({
                  minHeight: TAP - 20,
                  justifyContent: "center",
                  paddingHorizontal: space.xs,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <T variant="caption" style={{ color: ink[600], textDecorationLine: "underline" }}>
                  Skip
                </T>
              </Pressable>
              <View style={{ flex: 1 }} />
              {canGoBack ? (
                <Button title="Back" variant="secondary" onPress={goBack} />
              ) : null}
              <Button title={isLast ? "Finish" : "Next"} variant="brand" onPress={goNext} />
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
