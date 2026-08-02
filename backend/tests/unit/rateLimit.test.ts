import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { LIMITS, rateLimit, resetRateLimits } from "../../src/middleware/rateLimit.middleware";

/**
 * These endpoints spend money per request, so the thing worth proving is not
 * that a limiter exists but that it counts the RIGHT requests: per user, per
 * limiter, and released when the window passes.
 */

function fakeReq(userId?: number): Request {
  return { user: userId === undefined ? undefined : { id: userId }, ip: "10.0.0.1" } as unknown as Request;
}

function fakeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & typeof res;
}

/** Runs the middleware once and reports whether it passed the request on. */
function call(mw: ReturnType<typeof rateLimit>, req: Request) {
  const res = fakeRes();
  const next = vi.fn() as unknown as NextFunction;
  mw(req, res, next);
  return { res, allowed: (next as unknown as ReturnType<typeof vi.fn>).mock.calls.length === 1 };
}

describe("rateLimit", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.useRealTimers();
  });

  it("allows requests up to the limit and blocks the next one", () => {
    const mw = rateLimit({ name: "t", limit: 3, windowMs: 60_000 });
    const req = fakeReq(1);

    expect(call(mw, req).allowed).toBe(true);
    expect(call(mw, req).allowed).toBe(true);
    expect(call(mw, req).allowed).toBe(true);

    const fourth = call(mw, req);
    expect(fourth.allowed).toBe(false);
    expect(fourth.res.statusCode).toBe(429);
  });

  /**
   * The reason this is keyed per user and not per IP: several shop owners
   * sharing one connection is normal here, and IP keying would have them
   * throttling each other.
   */
  it("counts each user separately", () => {
    const mw = rateLimit({ name: "t", limit: 1, windowMs: 60_000 });

    expect(call(mw, fakeReq(1)).allowed).toBe(true);
    expect(call(mw, fakeReq(1)).allowed).toBe(false);
    // A different owner is unaffected by the first one's burst.
    expect(call(mw, fakeReq(2)).allowed).toBe(true);
  });

  /** Two limiters on one route must not share a bucket, or the tighter one
   *  would consume the looser one's allowance. */
  it("keeps separate counts per limiter name", () => {
    const burst = rateLimit({ name: "burst", limit: 1, windowMs: 60_000 });
    const hourly = rateLimit({ name: "hourly", limit: 5, windowMs: 3_600_000 });
    const req = fakeReq(1);

    expect(call(burst, req).allowed).toBe(true);
    expect(call(hourly, req).allowed).toBe(true);
    expect(call(burst, req).allowed).toBe(false);
    // The hourly limiter still has room; only the burst window is spent.
    expect(call(hourly, req).allowed).toBe(true);
  });

  it("lets the caller through again once the window has passed", () => {
    vi.useFakeTimers();
    const mw = rateLimit({ name: "t", limit: 1, windowMs: 60_000 });
    const req = fakeReq(1);

    expect(call(mw, req).allowed).toBe(true);
    expect(call(mw, req).allowed).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(call(mw, req).allowed).toBe(true);
  });

  it("tells the caller how long to wait", () => {
    const mw = rateLimit({ name: "t", limit: 1, windowMs: 60_000 });
    const req = fakeReq(1);
    call(mw, req);
    const blocked = call(mw, req);

    expect(blocked.res.headers["Retry-After"]).toBeDefined();
    // Worded for the owner: they did nothing wrong and there is nothing to fix.
    expect(String((blocked.res.body as { error: string }).error)).toMatch(/wait about \d+ seconds? and try again/);
  });

  it("falls back to the IP when there is no authenticated user", () => {
    const mw = rateLimit({ name: "t", limit: 1, windowMs: 60_000 });
    expect(call(mw, fakeReq()).allowed).toBe(true);
    expect(call(mw, fakeReq()).allowed).toBe(false);
  });

  /**
   * The limits are a burst guard, not a quota — set from what a person can
   * physically do. This pins the intent: if someone later tightens one to a
   * number a real owner could hit while working, this fails.
   */
  it("sets limits no working owner can reach by hand", () => {
    // A scan needs a photo, a review and a confirm. Not fifteen in a minute.
    expect(LIMITS.SCAN_RECEIPT_BURST.limit).toBeGreaterThanOrEqual(10);
    expect(LIMITS.SCAN_RECEIPT_BURST.windowMs).toBe(60_000);
    // Chattiest AI call — fires from a 500ms debounce while typing, so it has
    // to sit well above the others.
    expect(LIMITS.SUGGEST_CATEGORY.limit).toBeGreaterThan(LIMITS.ASK_BURST.limit);
  });
});
