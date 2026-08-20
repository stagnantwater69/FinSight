import { useEffect, useRef } from "react";
import type { View } from "react-native";
import type { TourTargetKey } from "./steps";

/**
 * How the overlay finds the thing a step is talking about.
 *
 * WHY A REGISTRY AND NOT REFS PASSED DOWN. The elements the tour points at are
 * scattered across the tab bar (App.tsx), Home's header, its quick actions and
 * its floating Ask button — four different owners, none of which is a parent
 * of the overlay. Threading refs from each of them through the navigator to a
 * modal would put tour plumbing in the signature of every component on the
 * way. A key each side agrees on keeps the coupling to one string.
 *
 * WHY measureInWindow. React Native has no getBoundingClientRect. Only
 * `measureInWindow` gives coordinates in the same space a full-screen modal
 * draws in, which is exactly what a spotlight needs; `measure` (parent-
 * relative) would put the hole in the wrong place inside a ScrollView.
 *
 * WHY EVERYTHING FAILS SOFT. Measurement is asynchronous and can simply never
 * call back — a view scrolled out of the tree, an element unmounted between
 * the step change and the measure, a native node already detached. Every path
 * here resolves to `null` instead of hanging, because the overlay turns null
 * into "skip this step", and a promise that never settles would turn it into
 * "the tour is stuck", which is the one outcome that must not happen.
 */

export interface TourRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Live registrations. Module scope because the tour is a singleton. */
const registry = new Map<TourTargetKey, () => View | null>();

/**
 * Register an element as a tour target.
 *
 * Usage: `<View {...useTourTarget("dashboard-summary")}>…</View>`.
 *
 * `collapsable: false` is not optional. Android's view flattening removes a
 * plain layout-only View from the native hierarchy, and a view that is not
 * there cannot be measured — the target would silently never resolve and the
 * step would silently skip, on one platform only.
 */
export function useTourTarget(key: TourTargetKey | undefined) {
  const ref = useRef<View | null>(null);

  useEffect(() => {
    // `undefined` is a real case, not sloppiness: a component rendered once per
    // item (a quick-action tile) has to call the hook unconditionally while
    // only one of those items is a tour target.
    if (!key) return;
    const getter = () => ref.current;
    registry.set(key, getter);
    return () => {
      // Only clear our own entry: two elements can briefly claim one key while
      // a screen is being replaced, and the outgoing one must not delete the
      // incoming one's registration.
      if (registry.get(key) === getter) registry.delete(key);
    };
  }, [key]);

  return { ref, collapsable: false } as const;
}

/** Whether anything currently claims this key — the cheap, synchronous check. */
export function hasTourTarget(key: TourTargetKey): boolean {
  return registry.get(key)?.() != null;
}

/**
 * Is this step's target on screen right now? Steps without one — the welcome
 * and completion cards — always are.
 *
 * Shared by the provider (which uses it to walk over steps whose features are
 * not present) and the overlay (which uses it for "N of M"), so the two can
 * never disagree about how many steps this owner is being shown.
 */
export function stepIsOnScreen(step: { target?: TourTargetKey }): boolean {
  return !step.target || hasTourTarget(step.target);
}

/** How long to wait for a measurement before treating the target as absent. */
const MEASURE_TIMEOUT_MS = 400;

export function measureTourTarget(key: TourTargetKey): Promise<TourRect | null> {
  const node = registry.get(key)?.();
  if (!node) return Promise.resolve(null);

  return new Promise<TourRect | null>((resolve) => {
    let settled = false;
    const finish = (rect: TourRect | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(rect);
    };
    const timer = setTimeout(() => finish(null), MEASURE_TIMEOUT_MS);

    try {
      node.measureInWindow((x, y, width, height) => {
        const usable =
          Number.isFinite(x) && Number.isFinite(y) && width > 2 && height > 2;
        finish(usable ? { x, y, width, height } : null);
      });
    } catch {
      finish(null);
    }
  });
}

/** Test seam and teardown: forget every registration. */
export function resetTourTargets() {
  registry.clear();
}
