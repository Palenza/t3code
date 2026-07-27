import type { ServerProvider } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { withCurrentRateLimits } from "./rateLimitProjection.ts";
import { recordRateLimitEvent, resetRateLimitStore } from "./rateLimitStore.ts";

/**
 * These tests exist because a mutation check showed the join is deletable in
 * silence: remove it and the typecheck stays at zero errors, every other test
 * stays green, and the client simply never receives a quota. A wiring nothing
 * exercises is a wiring that can be deleted without anyone noticing.
 */

const provider = (input: {
  readonly instanceId: string;
  readonly rateLimits?: ServerProvider["rateLimits"];
}): ServerProvider =>
  ({
    instanceId: input.instanceId,
    driver: "claudeAgent",
    displayName: "Claude",
    enabled: true,
    installed: true,
    version: "2.1.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-07-27T15:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    ...(input.rateLimits ? { rateLimits: input.rateLimits } : {}),
  }) as never;

const observe = (input: {
  readonly instanceId: string;
  readonly kind: string;
  readonly utilization: number;
}) =>
  recordRateLimitEvent({
    type: "account.rate-limits.updated",
    providerInstanceId: input.instanceId as never,
    createdAt: "2026-07-27T15:00:00.000Z",
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

describe("withCurrentRateLimits", () => {
  it("omits rateLimits entirely before the provider has reported", () => {
    // Not a zeroed snapshot: "nothing reported yet" and "you have used
    // nothing" are different claims, and the UI must be able to tell them
    // apart rather than render a confident 0%.
    const [joined] = withCurrentRateLimits([provider({ instanceId: "claude-default" })]);

    expect(joined?.rateLimits).toBeUndefined();
  });

  it("carries the usage observed for that instance", () => {
    observe({ instanceId: "claude-default", kind: "five_hour", utilization: 82 });

    const [joined] = withCurrentRateLimits([provider({ instanceId: "claude-default" })]);

    expect(joined?.rateLimits?.observedAt).toBe("2026-07-27T15:00:00.000Z");
    expect(joined?.rateLimits?.windows).toEqual([
      { kind: "five_hour", utilization: 82, severity: "allowed" },
    ]);
  });

  it("never shows one account's usage under another's name", () => {
    // The failure this guards against is invisible in the UI: a plausible
    // number, attributed to the wrong account. Two Claude instances are two
    // subscriptions with two independent quotas.
    observe({ instanceId: "claude-pro", kind: "five_hour", utilization: 97 });

    const joined = withCurrentRateLimits([
      provider({ instanceId: "claude-perso" }),
      provider({ instanceId: "claude-pro" }),
    ]);

    expect(joined[0]?.rateLimits).toBeUndefined();
    expect(joined[1]?.rateLimits?.windows[0]?.utilization).toBe(97);
  });

  it("strips a figure the store cannot vouch for", () => {
    // The realistic source is the on-disk snapshot cache, re-read at boot: it
    // would hand back yesterday's percentage for a window that has since
    // reset. The store is process-local precisely so that cannot happen, and
    // this is the step that enforces it.
    const stale = {
      observedAt: "2026-07-26T09:00:00.000Z",
      windows: [{ kind: "five_hour", utilization: 64 }],
    } as ServerProvider["rateLimits"];

    const [joined] = withCurrentRateLimits([
      provider({ instanceId: "claude-default", rateLimits: stale }),
    ]);

    expect(joined?.rateLimits).toBeUndefined();
  });

  it("lets a live reading replace a stale one", () => {
    observe({ instanceId: "claude-default", kind: "five_hour", utilization: 12 });

    const [joined] = withCurrentRateLimits([
      provider({
        instanceId: "claude-default",
        rateLimits: {
          observedAt: "2026-07-26T09:00:00.000Z",
          windows: [{ kind: "five_hour", utilization: 64 }],
        } as ServerProvider["rateLimits"],
      }),
    ]);

    expect(joined?.rateLimits?.observedAt).toBe("2026-07-27T15:00:00.000Z");
    expect(joined?.rateLimits?.windows[0]?.utilization).toBe(12);
  });
});
