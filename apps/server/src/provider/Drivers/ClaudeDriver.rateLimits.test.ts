import { beforeEach, describe, expect, it } from "vite-plus/test";

import { recordRateLimitEvent, resetRateLimitStore } from "../rateLimitStore.ts";
import { withInstanceIdentity } from "./ClaudeDriver.ts";

/**
 * Closes a coverage gap that a mutation check exposed: deleting the store read
 * from `withInstanceIdentity` left the typecheck at zero errors and every
 * other test green. The snapshot would simply never carry usage, in silence.
 *
 * These tests fail if that read is removed.
 */

const draft = {
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
} as never;

const identity = (instanceId: string) =>
  withInstanceIdentity({
    instanceId: instanceId as never,
    displayName: undefined,
    accentColor: undefined,
    continuationGroupKey: "group",
  });

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

describe("withInstanceIdentity", () => {
  it("omits rateLimits entirely before the provider has reported", () => {
    // Not a zeroed snapshot: "nothing reported yet" and "you have used
    // nothing" are different claims, and the UI must be able to tell them
    // apart rather than render a confident 0%.
    const provider = identity("claude-default")(draft);

    expect(provider.rateLimits).toBeUndefined();
  });

  it("carries the usage observed for that instance", () => {
    observe({ instanceId: "claude-default", kind: "five_hour", utilization: 82 });

    const provider = identity("claude-default")(draft);

    expect(provider.rateLimits?.observedAt).toBe("2026-07-27T15:00:00.000Z");
    expect(provider.rateLimits?.windows).toEqual([
      { kind: "five_hour", utilization: 82, severity: "allowed" },
    ]);
  });

  it("never shows one account's usage under another's name", () => {
    // The failure this guards against is invisible in the UI: a plausible
    // number, attributed to the wrong account. Two Claude instances are two
    // subscriptions with two independent quotas.
    observe({ instanceId: "claude-pro", kind: "five_hour", utilization: 97 });

    expect(identity("claude-perso")(draft).rateLimits).toBeUndefined();
    expect(identity("claude-pro")(draft).rateLimits?.windows[0]?.utilization).toBe(97);
  });
});
