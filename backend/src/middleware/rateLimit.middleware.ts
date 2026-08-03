import type { NextFunction, Request, Response } from "express";

/**
 * A burst guard for the endpoints that spend real money.
 *
 * WHY THIS EXISTS. Uploading a receipt runs OCR and can call a vision model
 * and the categoriser; asking FinSight a question calls Gemini or OpenRouter.
 * Every one of those is billed per request, and before this there was nothing
 * server-side stopping the same call repeating forever. The realistic failure
 * is not an attacker — it is a retry loop in a client, or a `useEffect` with a
 * wrong dependency array firing an upload on every render. Either can spend a
 * lot of money in the minutes before anyone notices.
 *
 * WHAT IT IS AND IS NOT. This is a burst guard, deliberately, not a quota. The
 * limits are set so that no human working normally can reach them, and a loop
 * reaches them within seconds. It is NOT a defence against a determined
 * attacker with a valid account — that needs a sustained-usage budget and
 * alerting, which is a different piece of work. Saying so here so nobody reads
 * this file and assumes the cost problem is fully solved.
 *
 * KEYED PER USER, not per IP. These routes all sit behind requireAuth, and
 * several owners sharing one shop's connection is a normal case in this market
 * — an IP-keyed limiter would have them throttling each other. The IP fallback
 * only matters if this is ever mounted before auth.
 *
 * IN-MEMORY, single process. That is honest for how FinSight is deployed today
 * (one backend container). Behind more than one instance each would keep its
 * own counts and the effective limit would multiply by the instance count; at
 * that point this needs to move to Redis or the database.
 */

interface Bucket {
  count: number;
  /** Epoch ms at which this bucket resets. */
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Drops buckets that have already expired.
 *
 * Without this the Map grows once per user per limiter and never shrinks —
 * small, but it is a leak, and a leak in a process meant to run for weeks.
 * `unref()` so this timer never by itself keeps the process (or a test runner)
 * alive.
 */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, SWEEP_INTERVAL_MS);
sweepTimer.unref();

export interface RateLimitOptions {
  /** Distinguishes limiters so two on one route do not share a bucket. */
  name: string;
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
}

/** Exported for tests, so a suite can start from a known state. */
export function resetRateLimits() {
  buckets.clear();
}

export function rateLimit({ name, limit, windowMs }: RateLimitOptions) {
  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const identity = req.user?.id !== undefined ? `u${req.user.id}` : `ip${req.ip ?? "unknown"}`;
    const key = `${name}:${identity}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count++;

    const remaining = Math.max(0, limit - bucket.count);
    const resetSeconds = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader("RateLimit-Limit", String(limit));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(resetSeconds));

    if (bucket.count > limit) {
      res.setHeader("Retry-After", String(resetSeconds));
      /*
       * Answered here rather than by throwing ApiError, so the response can
       * carry Retry-After — and worded for the owner, not the developer. They
       * did nothing wrong and there is nothing for them to fix; the honest
       * message is "wait a moment and it will work".
       */
      return res.status(429).json({
        error: `Too many requests in a short time. Please wait about ${resetSeconds} second${
          resetSeconds === 1 ? "" : "s"
        } and try again.`,
      });
    }

    return next();
  };
}

/**
 * The limits themselves, in one place so they can be read together.
 *
 * Each is set from what a person can physically do, not from a cost target:
 *
 *   - SCAN_RECEIPT: every scan needs a photograph, a look at the review screen
 *     and a confirm. Fifteen of those inside one minute is not a person.
 *   - ASK: a question has to be typed and its answer read. Twenty a minute is
 *     not a person either.
 *   - SUGGEST_CATEGORY: the exception, and the reason the limits are not all
 *     the same — this one fires from a 500 ms debounce while an owner types a
 *     description, so it is legitimately the chattiest AI call in the product.
 *     Sized well above what continuous typing produces.
 *
 * Hourly caps sit alongside the per-minute ones on the two costliest routes.
 * A minute window alone would let a loop that is slow enough to stay under it
 * run all day; the hour window bounds that without punishing a genuine burst,
 * because someone entering a month of receipts in one sitting still fits.
 */
export const LIMITS = {
  SCAN_RECEIPT_BURST: { name: "scan-receipt-burst", limit: 15, windowMs: 60_000 },
  SCAN_RECEIPT_HOURLY: { name: "scan-receipt-hourly", limit: 200, windowMs: 60 * 60_000 },
  // Generous relative to SCAN_RECEIPT_BURST: this fires once per SHUTTER
  // PRESS during a multi-page capture session (up to MAX_PAGES photos, plus
  // retakes), not once per submitted receipt — a real session can call this
  // several times before a single scan-receipt call ever happens.
  QUALITY_CHECK_BURST: { name: "quality-check-burst", limit: 40, windowMs: 60_000 },
  ASK_BURST: { name: "ai-ask-burst", limit: 20, windowMs: 60_000 },
  ASK_HOURLY: { name: "ai-ask-hourly", limit: 200, windowMs: 60 * 60_000 },
  SUGGEST_CATEGORY: { name: "ai-suggest-category", limit: 60, windowMs: 60_000 },
} as const;
