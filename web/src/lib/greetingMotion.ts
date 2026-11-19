import { useSyncExternalStore } from "react";

/**
 * Whether Fin's greeting on the Dashboard is held still. Web twin of mobile's
 * lib/greetingMotion.ts: device-local like the theme, and a shared store so
 * Settings and a mounted greeting change on the same tick. Blocked storage
 * leaves the greeting playing, as it did before this setting existed.
 */
const KEY = "finsight.greetingMotion";

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "paused";
  } catch {
    return false;
  }
}

let paused = read();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setGreetingPaused(next: boolean): void {
  paused = next;
  for (const listener of listeners) listener();
  try {
    window.localStorage.setItem(KEY, next ? "paused" : "playing");
  } catch {
    // Still applies for this visit.
  }
}

export function useGreetingPaused(): boolean {
  return useSyncExternalStore(subscribe, () => paused);
}

/** Tests only: re-read storage. */
export function resetGreetingMotionForTests(): void {
  paused = read();
}
