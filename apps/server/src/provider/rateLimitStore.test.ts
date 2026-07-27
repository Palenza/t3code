import { beforeEach, describe, expect, it } from "vite-plus/test";

import { getRateLimits, recordRateLimitEvent, resetRateLimitStore } from "./rateLimitStore.ts";

const instance = (id: string) => id as never;

const claudeEvent = (input: {
  readonly instanceId?: string;
  readonly kind: string;
  readonly utilization: number;
  readonly at: string;
}) => ({
  type: "account.rate-limits.updated",
  ...(input.instanceId !== undefined ? { providerInstanceId: instance(input.instanceId) } : {}),
  createdAt: input.at,
  payload: {
    rateLimits: {
      rate_limit_info: {
        status: "allowed",
        rateLimitType: input.kind,
        utilization: input.utilization,
      },
    },
  },
});

beforeEach(() => {
  resetRateLimitStore();
});

describe("recordRateLimitEvent", () => {
  it("ignores events that are not rate-limit updates", () => {
    const result = recordRateLimitEvent({
      type: "thread.token-usage.updated",
      providerInstanceId: instance("claude-default"),
      createdAt: "2026-07-27T15:00:00.000Z",
      payload: { rateLimits: { rate_limit_info: { status: "allowed", utilization: 50 } } },
    });

    expect(result).toBeUndefined();
    expect(getRateLimits(instance("claude-default"))).toBeUndefined();
  });

  it("drops an event with no instance rather than guessing which account it is", () => {
    // Falling back to the driver kind, or to one global slot, would show one
    // account's usage under another's name. Losing the reading is the lesser
    // harm; attributing it wrongly is a lie the UI cannot detect.
    const result = recordRateLimitEvent(
      claudeEvent({ kind: "five_hour", utilization: 80, at: "2026-07-27T15:00:00.000Z" }),
    );

    expect(result).toBeUndefined();
  });

  it("keeps two instances of the same driver apart", () => {
    // Two Claude accounts, two independent quotas. This is the whole reason
    // the store is keyed by instance and not by driver kind.
    recordRateLimitEvent(
      claudeEvent({
        instanceId: "claude-perso",
        kind: "five_hour",
        utilization: 5,
        at: "2026-07-27T15:00:00.000Z",
      }),
    );
    recordRateLimitEvent(
      claudeEvent({
        instanceId: "claude-pro",
        kind: "five_hour",
        utilization: 97,
        at: "2026-07-27T15:00:00.000Z",
      }),
    );

    expect(getRateLimits(instance("claude-perso"))?.windows[0]?.utilization).toBe(5);
    expect(getRateLimits(instance("claude-pro"))?.windows[0]?.utilization).toBe(97);
  });

  it("accumulates windows that arrive in separate events", () => {
    // Claude sends one window per message. Both must end up visible at once.
    recordRateLimitEvent(
      claudeEvent({
        instanceId: "claude-default",
        kind: "seven_day",
        utilization: 31,
        at: "2026-07-27T15:00:00.000Z",
      }),
    );
    recordRateLimitEvent(
      claudeEvent({
        instanceId: "claude-default",
        kind: "five_hour",
        utilization: 82,
        at: "2026-07-27T15:05:00.000Z",
      }),
    );

    const stored = getRateLimits(instance("claude-default"));
    expect(stored?.windows.map((window) => window.kind)).toEqual(["seven_day", "five_hour"]);
    expect(stored?.observedAt).toBe("2026-07-27T15:05:00.000Z");
  });

  it("reports no change when an event carries nothing usable", () => {
    // Lets the caller skip a pointless push to the client, and keeps the
    // stored observation time honest.
    recordRateLimitEvent(
      claudeEvent({
        instanceId: "claude-default",
        kind: "five_hour",
        utilization: 40,
        at: "2026-07-27T15:00:00.000Z",
      }),
    );

    const result = recordRateLimitEvent({
      type: "account.rate-limits.updated",
      providerInstanceId: instance("claude-default"),
      createdAt: "2026-07-27T16:00:00.000Z",
      payload: { rateLimits: {} },
    });

    expect(result).toBeUndefined();
    expect(getRateLimits(instance("claude-default"))?.observedAt).toBe("2026-07-27T15:00:00.000Z");
  });
});
