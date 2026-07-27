import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { type AccountRateLimitInfo, ProviderRuntimeEvent } from "./providerRuntime.ts";

/**
 * Compile-time guard, and the load-bearing one.
 *
 * A mutation check (reverting the payload to `Schema.Unknown`) failed only one
 * of the runtime tests below: the union is permissive by design, so decoding
 * cannot prove much. The real guarantee lives in the types — this file is
 * typechecked, so losing a field or widening `status` breaks `tsgo --noEmit`
 * here, before anything ships.
 *
 * Runtime tests document the shapes. This block defends them.
 */
// Never called — a `declare const` at module scope would compile fine and then
// throw `ReferenceError` on import, taking the whole suite down. Inside a
// function body the assertions are typechecked without ever running.
function _rateLimitInfoShape(info: AccountRateLimitInfo): void {
  const status: "allowed" | "allowed_warning" | "rejected" = info.status;
  const utilization: number | undefined = info.utilization;
  const resetsAt: number | undefined = info.resetsAt;
  const isUsingOverage: boolean | undefined = info.isUsingOverage;
  void status;
  void utilization;
  void resetsAt;
  void isUsingOverage;
}
void _rateLimitInfoShape;

/**
 * `account.rate-limits.updated` is emitted by two adapters that put genuinely
 * different shapes under the same `rateLimits` key. These tests pin both, plus
 * the fallback, because the failure they guard against is invisible: a payload
 * modelled for one provider decodes the other to `{}` — no error, no warning,
 * just an empty object where a subscription's usage used to be.
 *
 * A typecheck cannot catch that. Only decoding a real payload can.
 */

const decode = Schema.decodeUnknownSync(ProviderRuntimeEvent);

const base = {
  eventId: "evt-rate-limits-1",
  provider: "claude",
  threadId: "thread-rate-limits-1",
  createdAt: "2026-07-27T15:00:00.000Z",
} as const;

// Guard against a fixture that is wrong in some unrelated way: every negative
// assertion below would then "pass" by throwing on the wrong field. Pin the
// base once, here, so a rejection later can only come from the payload.
describe("test fixture", () => {
  it("decodes with a minimal, valid payload", () => {
    const event = decode({
      ...base,
      type: "account.rate-limits.updated",
      payload: { rateLimits: { rate_limit_info: { status: "allowed" } } },
    });
    expect(event.provider).toBe("claude");
    expect(event.threadId).toBe("thread-rate-limits-1");
  });
});

describe("account.rate-limits.updated", () => {
  it("keeps the Claude SDK shape intact, including a zero utilization", () => {
    // Mirrors SDKRateLimitEvent from @anthropic-ai/claude-agent-sdk, forwarded
    // verbatim by ClaudeAdapter.
    const event = decode({
      ...base,
      type: "account.rate-limits.updated",
      payload: {
        rateLimits: {
          type: "rate_limit_event",
          uuid: "0199c0de-0000-7000-8000-000000000000",
          session_id: "session-1",
          rate_limit_info: {
            status: "allowed_warning",
            rateLimitType: "five_hour",
            utilization: 0,
            resetsAt: 1_785_000_000,
            isUsingOverage: false,
          },
        },
      },
    });

    expect(event.type).toBe("account.rate-limits.updated");
    const payload = event.payload as { rateLimits: Record<string, unknown> };
    const info = payload.rateLimits.rate_limit_info as Record<string, unknown>;

    expect(info.status).toBe("allowed_warning");
    expect(info.rateLimitType).toBe("five_hour");
    // 0 must survive: a falsy-check on utilization would drop a fresh account.
    expect(info.utilization).toBe(0);
    expect(info.resetsAt).toBe(1_785_000_000);
  });

  it("keeps the Codex notification shape intact rather than emptying it", () => {
    // Mirrors V2AccountRateLimitsUpdatedNotification, forwarded by CodexAdapter.
    // Nested one level deeper than Claude's — the exact reason a single struct
    // cannot serve both.
    const event = decode({
      ...base,
      provider: "codex",
      type: "account.rate-limits.updated",
      payload: {
        rateLimits: {
          rateLimits: {
            limitName: "weekly",
            planType: "pro",
            primary: { usedPercent: 41.5 },
            spendControlReached: false,
          },
        },
      },
    });

    const payload = event.payload as { rateLimits: { rateLimits: Record<string, unknown> } };
    expect(payload.rateLimits.rateLimits.limitName).toBe("weekly");
    expect(payload.rateLimits.rateLimits.planType).toBe("pro");
    expect(payload.rateLimits.rateLimits.spendControlReached).toBe(false);
  });

  it("carries an unmodelled provider shape through instead of dropping it", () => {
    // Whoever emits this event next must not lose data just because we have
    // not described their shape yet. Absence has to mean "the provider sent
    // nothing", never "we failed to describe what it sent".
    const event = decode({
      ...base,
      provider: "grok",
      type: "account.rate-limits.updated",
      payload: { rateLimits: { somethingWeHaveNotSeenYet: 7 } },
    });

    const payload = event.payload as { rateLimits: Record<string, unknown> };
    expect(payload.rateLimits.somethingWeHaveNotSeenYet).toBe(7);
  });

  it("degrades an unrecognised status to the raw shape instead of rejecting it", () => {
    // The contract is "typed when we recognise it, preserved when we do not".
    //
    // `status` is a closed union, so a value outside it cannot match the
    // Claude member — but the payload is NOT rejected: it falls through to the
    // permissive record member and arrives intact, untyped. That is the
    // deliberate trade-off of keeping a fallback at all. Losing a provider's
    // usage data is worse than handing the consumer something it must narrow.
    //
    // The practical consequence, and the reason this test exists: a consumer
    // must never assume `rate_limit_info` is the typed shape just because the
    // key is present. Narrow before reading.
    const event = decode({
      ...base,
      type: "account.rate-limits.updated",
      payload: {
        rateLimits: { rate_limit_info: { status: "somehow_new", utilization: 12 } },
      },
    });

    const payload = event.payload as { rateLimits: Record<string, unknown> };
    const info = payload.rateLimits.rate_limit_info as Record<string, unknown>;
    expect(info.status).toBe("somehow_new");
    expect(info.utilization).toBe(12);
  });

  it("rejects a payload that is not a record at all", () => {
    // The one thing the fallback does not swallow: `rateLimits` must be an
    // object. Without this, the union would accept anything and the schema
    // would be decoration rather than a contract.
    expect(() =>
      decode({
        ...base,
        type: "account.rate-limits.updated",
        payload: { rateLimits: "not-an-object" },
      }),
    ).toThrow();
  });

  it("accepts an unknown rateLimitType without breaking the pipeline", () => {
    const event = decode({
      ...base,
      type: "account.rate-limits.updated",
      payload: {
        rateLimits: {
          rate_limit_info: { status: "allowed", rateLimitType: "thirty_day_something" },
        },
      },
    });

    const payload = event.payload as { rateLimits: Record<string, unknown> };
    const info = payload.rateLimits.rate_limit_info as Record<string, unknown>;
    expect(info.rateLimitType).toBe("thirty_day_something");
  });
});
