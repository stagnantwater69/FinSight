import { useEffect, useState } from "react";

/** Matches `animate-pop-out` in tailwind.config.js. */
export const EXIT_MS = 120;

/**
 * Keeps a closing menu mounted for its exit animation. `leaving` is true for
 * those last milliseconds: the menu should play its exit and be `inert`, so
 * nothing in it can be clicked or focused after the owner closed it.
 */
export function usePresence(open: boolean): { mounted: boolean; leaving: boolean } {
  const [lingering, setLingering] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  // Adjusted during render rather than in an effect, so the exit frame is the
  // very next paint and never one frame of nothing.
  if (open !== wasOpen) {
    setWasOpen(open);
    setLingering(!open);
  }

  useEffect(() => {
    if (!lingering) return;
    const timer = window.setTimeout(() => setLingering(false), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [lingering]);

  return { mounted: open || lingering, leaving: !open && lingering };
}
