import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Transient confirmations — the mockup's `toast()`.
 *
 * Why this exists: several actions (save, switch business, mark reviewed)
 * currently confirm by navigating away, which leaves the owner to infer that
 * it worked. A toast states it.
 *
 * Accessibility: the viewport is a polite live region, so a screen reader
 * announces the message without stealing focus. `role="status"` rather than
 * `alert` because none of these are urgent — an actual failure belongs in an
 * <Alert> next to the thing that failed, not in a message that disappears.
 *
 * Deliberately NOT used for errors. A message that vanishes after 3 seconds
 * is the wrong place for something the owner may need to act on.
 */

type Toast = { id: number; message: string };

const ToastContext = createContext<((message: string) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((message: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  // Stable identity so consumers don't re-render on every toast change.
  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[200] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex max-w-full animate-toast-in items-center gap-2.5 rounded-full bg-ink-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
          >
            <span aria-hidden className="text-brand-300">
              ✓
            </span>
            <span className="min-w-0 truncate">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Returns a `toast(message)` function. Safe to call outside a provider (it
 * becomes a no-op) so a component is never coupled to being mounted inside
 * one — the confirmation is a nicety, never load-bearing.
 */
export function useToast() {
  return useContext(ToastContext) ?? (() => undefined);
}
