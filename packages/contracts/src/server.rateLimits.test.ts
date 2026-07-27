import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { ServerProviderRateLimits } from "./server.ts";

/**
 * The account-level shape the UI renders. Its whole job is to be unambiguous,
 * so the tests here pin the three judgement calls that are easy to "fix" into
 * a bug later.
 */

const decode = Schema.decodeUnknownSync(ServerProviderRateLimits);

describe("ServerProviderRateLimits", () => {
  it("keeps a zero utilization instead of treating it as missing", () => {
    // A fresh account reports 0. Any falsy check upstream turns "you have used
    // nothing" into "we know nothing", which is the opposite claim.
    const limits = decode({
      observedAt: "2026-07-27T15:00:00.000Z",
      windows: [{ kind: "five_hour", utilization: 0 }],
    });

    expect(limits.windows[0]?.utilization).toBe(0);
  });

  it("keeps a utilization above 100 rather than clamping it away", () => {
    // Providers do report past 100 (overage). Clamping at ingestion would
    // erase the one signal that says "you are over". Render-time clamping is
    // a display concern and belongs in the component, not the contract.
    const limits = decode({
      observedAt: "2026-07-27T15:00:00.000Z",
      windows: [{ kind: "seven_day", utilization: 103.4 }],
    });

    expect(limits.windows[0]?.utilization).toBeCloseTo(103.4);
  });

  it("accepts a window kind nobody has seen yet", () => {
    // Providers add windows without warning. An unknown one still renders as
    // "some limit at N%"; dropping it would silently under-report usage.
    const limits = decode({
      observedAt: "2026-07-27T15:00:00.000Z",
      windows: [{ kind: "thirty_day_something", utilization: 12 }],
    });

    expect(limits.windows[0]?.kind).toBe("thirty_day_something");
  });

  it("rejects a severity the UI could not colour", () => {
    expect(() =>
      decode({
        observedAt: "2026-07-27T15:00:00.000Z",
        windows: [{ kind: "five_hour", utilization: 12, severity: "chartreuse" }],
      }),
    ).toThrow();
  });

  it("refuses a snapshot with no observation time", () => {
    // A quota without its age is an unattributed claim: a stale 12% and a
    // fresh 12% are different statements, and the UI must be able to say which
    // one it is showing.
    expect(() => decode({ windows: [{ kind: "five_hour", utilization: 12 }] })).toThrow();
  });

  it("accepts a window with no percentage at all", () => {
    // This is the SHAPE CLAUDE ACTUALLY SENDS. Verified on a real turn
    // (28/07/2026): `status`, `resetsAt`, `rateLimitType`, and no
    // `utilization`. Requiring the percentage here made the whole event
    // undecodable upstream, and the account displayed nothing — a feature
    // failing exactly like a provider that never reports.
    const limits = decode({
      observedAt: "2026-07-27T15:00:00.000Z",
      windows: [{ kind: "five_hour", severity: "allowed", resetsAtEpoch: 1_785_211_800 }],
    });

    expect(limits.windows[0]?.utilization).toBeUndefined();
    expect(limits.windows[0]?.resetsAtEpoch).toBe(1_785_211_800);
  });

  it("keeps resetsAtEpoch as the provider's raw number", () => {
    // Not converted to a date on purpose: the SDK documents no unit for it,
    // and seconds vs milliseconds differ by a factor of 1000. Freezing a guess
    // into the contract would make every consumer confidently wrong.
    const limits = decode({
      observedAt: "2026-07-27T15:00:00.000Z",
      windows: [{ kind: "five_hour", utilization: 12, resetsAtEpoch: 1_785_000_000 }],
    });

    expect(limits.windows[0]?.resetsAtEpoch).toBe(1_785_000_000);
  });
});
