// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXIT_MS, usePresence } from "./usePresence";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("usePresence", () => {
  it("stays mounted and marked leaving for the exit, then unmounts", () => {
    const { result, rerender } = renderHook(({ open }) => usePresence(open), { initialProps: { open: false } });
    expect(result.current).toEqual({ mounted: false, leaving: false });

    rerender({ open: true });
    expect(result.current).toEqual({ mounted: true, leaving: false });

    rerender({ open: false });
    expect(result.current).toEqual({ mounted: true, leaving: true });

    act(() => vi.advanceTimersByTime(EXIT_MS));
    expect(result.current).toEqual({ mounted: false, leaving: false });
  });

  it("reopening during the exit cancels it", () => {
    const { result, rerender } = renderHook(({ open }) => usePresence(open), { initialProps: { open: true } });
    rerender({ open: false });
    rerender({ open: true });
    act(() => vi.advanceTimersByTime(EXIT_MS));
    expect(result.current).toEqual({ mounted: true, leaving: false });
  });
});
