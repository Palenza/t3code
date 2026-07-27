import { describe, expect, it } from "vite-plus/test";

import {
  applyRateLimitEvent,
  mergeRateLimitWindows,
  rateLimitWindowsFromPayload,
} from "./rateLimitSnapshot.ts";

const at = "2026-07-27T15:00:00.000Z";

describe("rateLimitWindowsFromPayload", () => {
  it("reads the Claude shape", () => {
    const windows = rateLimitWindowsFromPayload({
      rateLimits: {
        type: "rate_limit_event",
        rate_limit_info: {
          status: "allowed_warning",
          rateLimitType: "five_hour",
          utilization: 82.5,
          resetsAt: 1_785_000_000,
        },
      },
    });

    expect(windows).toEqual([
      {
        kind: "five_hour",
        utilization: 82.5,
        severity: "allowed_warning",
        resetsAtEpoch: 1_785_000_000,
      },
    ]);
  });

  it("keeps a zero utilization", () => {
    // A fresh account reports 0. A falsy check here would silently drop it and
    // the account would look unmonitored rather than unused.
    const windows = rateLimitWindowsFromPayload({
      rateLimits: {
        rate_limit_info: { status: "allowed", rateLimitType: "seven_day", utilization: 0 },
      },
    });

    expect(windows).toHaveLength(1);
    expect(windows[0]?.utilization).toBe(0);
  });

  it("labels an unnamed Claude window rather than dropping it", () => {
    const windows = rateLimitWindowsFromPayload({
      rateLimits: { rate_limit_info: { status: "rejected", utilization: 100 } },
    });

    expect(windows[0]?.kind).toBe("limit");
    expect(windows[0]?.severity).toBe("rejected");
  });

  it("ignores a severity outside the closed set instead of failing", () => {
    const windows = rateLimitWindowsFromPayload({
      rateLimits: { rate_limit_info: { status: "chartreuse", utilization: 40 } },
    });

    expect(windows).toHaveLength(1);
    expect(windows[0]?.severity).toBeUndefined();
    expect(windows[0]?.utilization).toBe(40);
  });

  it("reads both Codex windows", () => {
    const windows = rateLimitWindowsFromPayload({
      rateLimits: {
        rateLimits: {
          primary: { usedPercent: 41, resetsAt: 1_785_000_111 },
          secondary: { usedPercent: 7 },
          limitName: "weekly",
        },
      },
    });

    expect(windows).toEqual([
      { kind: "primary", utilization: 41, resetsAtEpoch: 1_785_000_111 },
      { kind: "secondary", utilization: 7 },
    ]);
  });

  it("returns nothing rather than a fabricated zero", () => {
    // "We received nothing" and "you have used nothing" are different claims.
    expect(rateLimitWindowsFromPayload({ rateLimits: { rate_limit_info: {} } })).toEqual([]);
    expect(rateLimitWindowsFromPayload({ rateLimits: {} })).toEqual([]);
    expect(rateLimitWindowsFromPayload({})).toEqual([]);
    expect(rateLimitWindowsFromPayload("nope")).toEqual([]);
    expect(rateLimitWindowsFromPayload(undefined)).toEqual([]);
  });
});

describe("mergeRateLimitWindows", () => {
  it("keeps a previously known window that this event did not mention", () => {
    // The reason this module exists: Claude sends one window per event, so
    // replacing the snapshot would drop the seven-day figure every time a
    // five-hour update lands, and both would never show at once.
    const merged = mergeRateLimitWindows(
      [
        { kind: "seven_day", utilization: 31 },
        { kind: "five_hour", utilization: 10 },
      ],
      [{ kind: "five_hour", utilization: 82 }],
    );

    expect(merged).toEqual([
      { kind: "seven_day", utilization: 31 },
      { kind: "five_hour", utilization: 82 },
    ]);
  });

  it("keeps a stable order so gauges do not reshuffle between updates", () => {
    const merged = mergeRateLimitWindows(
      [
        { kind: "a", utilization: 1 },
        { kind: "b", utilization: 2 },
      ],
      [
        { kind: "b", utilization: 20 },
        { kind: "c", utilization: 3 },
      ],
    );

    expect(merged.map((window) => window.kind)).toEqual(["a", "b", "c"]);
  });
});

describe("applyRateLimitEvent", () => {
  it("merges into the previous snapshot and refreshes the observation time", () => {
    const next = applyRateLimitEvent({
      previous: {
        observedAt: "2026-07-27T14:00:00.000Z" as never,
        windows: [{ kind: "seven_day", utilization: 31 }],
      },
      payload: {
        rateLimits: {
          rate_limit_info: { status: "allowed", rateLimitType: "five_hour", utilization: 5 },
        },
      },
      observedAt: at,
    });

    expect(next?.observedAt).toBe(at);
    expect(next?.windows).toEqual([
      { kind: "seven_day", utilization: 31 },
      { kind: "five_hour", utilization: 5, severity: "allowed" },
    ]);
  });

  it("leaves the snapshot untouched when the event carries nothing usable", () => {
    // Refreshing `observedAt` on an unparseable event would make the snapshot
    // claim to be more recent than the last real figure it holds — an honest
    // stale reading is better than a fresh-looking lie.
    const previous = {
      observedAt: "2026-07-27T14:00:00.000Z" as never,
      windows: [{ kind: "seven_day", utilization: 31 }],
    };

    expect(applyRateLimitEvent({ previous, payload: { rateLimits: {} }, observedAt: at })).toBe(
      previous,
    );
  });

  it("stays undefined when there is nothing before and nothing usable now", () => {
    expect(
      applyRateLimitEvent({ previous: undefined, payload: {}, observedAt: at }),
    ).toBeUndefined();
  });
});
