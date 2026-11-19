import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";

/**
 * Whether Fin's greeting on Home is held still.
 *
 * Device-local, like the theme (see themeStore.ts): it is about how this phone
 * behaves, not about the account, so it needs no server field. A small shared
 * store rather than component state, because Settings writes it while Home's
 * greeting is still mounted underneath and must stop on the same tick.
 *
 * A failed read or write leaves the greeting playing, which is how it behaved
 * before this setting existed.
 */

// SecureStore keys must be alphanumeric, ".", "-" or "_".
const KEY = "finsight.greetingMotion";

let paused = false;
let requested = false;
let chosen = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function loadOnce() {
  if (requested) return;
  requested = true;
  SecureStore.getItemAsync(KEY)
    .then((value) => {
      // A choice made while the read was in flight wins over the stored one.
      if (chosen || value !== "paused") return;
      paused = true;
      emit();
    })
    .catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setGreetingPaused(next: boolean): void {
  chosen = true;
  paused = next;
  emit();
  SecureStore.setItemAsync(KEY, next ? "paused" : "playing").catch(() => {});
}

export function useGreetingPaused(): boolean {
  loadOnce();
  return useSyncExternalStore(subscribe, () => paused);
}

/** Tests only: forget what this module has read or been told. */
export function resetGreetingMotionForTests(): void {
  paused = false;
  requested = false;
  chosen = false;
}
