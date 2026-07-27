import { describe, expect, it } from "vite-plus/test";
import type { ServerProvider } from "@t3tools/contracts";

import {
  formatWindowLabel,
  presentProviderRateLimits,
  resolveResetInstant,
  resolveTone,
} from "./providerRateLimits";

const NOW = Date.parse("2026-07-27T15:00:00.000Z");

const rateLimits = (input: {
  readonly observedAt?: string;
  readonly windows: ReadonlyArray<{
    readonly kind: string;
    readonly utilization: number;
    readonly severity?: "allowed" | "allowed_warning" | "rejected";
    readonly resetsAtEpoch?: number;
  }>;
}): ServerProvider["rateLimits"] =>
  ({
    observedAt: input.observedAt ?? "2026-07-27T15:00:00.000Z",
    windows: input.windows,
  }) as never;

describe("presentProviderRateLimits", () => {
  it("shows nothing at all when the provider has never reported", () => {
    // An empty gauge would read as "0% used". Absent has to stay absent.
    expect(presentProviderRateLimits({ rateLimits: undefined, now: NOW })).toBeNull();
    expect(presentProviderRateLimits({ rateLimits: rateLimits({ windows: [] }), now: NOW })).toBe(
      null,
    );
  });

  it("always dates the reading", () => {
    const presented = presentProviderRateLimits({
      rateLimits: rateLimits({
        observedAt: "2026-07-27T14:48:00.000Z",
        windows: [{ kind: "five_hour", utilization: 12 }],
      }),
      now: NOW,
    });

    expect(presented?.observedLabel).toBe("measured 12 min ago");
  });

  it("drops a reading old enough to describe a window that has moved", () => {
    // Where this comes from in practice: the client's own cached config,
    // replayed on reconnect before the live snapshot lands.
    const presented = presentProviderRateLimits({
      rateLimits: rateLimits({
        observedAt: "2026-07-26T09:00:00.000Z",
        windows: [{ kind: "five_hour", utilization: 64 }],
      }),
      now: NOW,
    });

    expect(presented).toBeNull();
  });

  it("reports an overage instead of flattening it to 100%", () => {
    // The bar cannot be longer than itself, but the figure can say 103, and
    // that is the only thing telling the reader they are over.
    const presented = presentProviderRateLimits({
      rateLimits: rateLimits({ windows: [{ kind: "five_hour", utilization: 103 }] }),
      now: NOW,
    });

    expect(presented?.gauges[0]?.percentLabel).toBe("103%");
    expect(presented?.gauges[0]?.barPercent).toBe(100);
    expect(presented?.gauges[0]?.tone).toBe("critical");
  });

  it("renders a window it has never heard of", () => {
    const presented = presentProviderRateLimits({
      rateLimits: rateLimits({ windows: [{ kind: "thirty_day_sonnet", utilization: 40 }] }),
      now: NOW,
    });

    expect(presented?.gauges[0]?.label).toBe("Thirty day sonnet");
    expect(presented?.gauges[0]?.percentLabel).toBe("40%");
  });
});

describe("resolveTone", () => {
  it("lets the provider's own severity outrank the percentage", () => {
    // A provider saying "rejected" at 20% knows something the number does not.
    expect(resolveTone({ kind: "five_hour", utilization: 20, severity: "rejected" } as never)).toBe(
      "critical",
    );
    expect(
      resolveTone({ kind: "five_hour", utilization: 4, severity: "allowed_warning" } as never),
    ).toBe("warning");
  });

  it("falls back to thresholds when no severity is reported", () => {
    expect(resolveTone({ kind: "five_hour", utilization: 49 } as never)).toBe("normal");
    expect(resolveTone({ kind: "five_hour", utilization: 50 } as never)).toBe("warning");
    expect(resolveTone({ kind: "five_hour", utilization: 85 } as never)).toBe("critical");
  });
});

describe("resolveResetInstant", () => {
  it("reads both units the providers actually send", () => {
    expect(resolveResetInstant(1_785_000_000)).toBe(1_785_000_000_000);
    expect(resolveResetInstant(1_785_000_000_000)).toBe(1_785_000_000_000);
  });

  it("refuses a number that cannot be a timestamp", () => {
    expect(resolveResetInstant(0)).toBeNull();
    expect(resolveResetInstant(-1)).toBeNull();
    expect(resolveResetInstant(Number.NaN)).toBeNull();
  });
});

describe("reset labels", () => {
  const withReset = (resetsAtEpoch: number) =>
    presentProviderRateLimits({
      rateLimits: rateLimits({ windows: [{ kind: "five_hour", utilization: 30, resetsAtEpoch }] }),
      now: NOW,
    })?.gauges[0]?.resetLabel;

  it("says when the window comes back, in either unit", () => {
    expect(withReset(NOW / 1000 + 2 * 3600)).toBe("resets in about 2 h");
    expect(withReset(NOW + 2 * 3600 * 1000)).toBe("resets in about 2 h");
    expect(withReset(NOW / 1000 + 35 * 60)).toBe("resets in 35 min");
  });

  it("stays silent rather than showing a reset it cannot vouch for", () => {
    // A wrong unit guess lands the instant decades away; a past one describes
    // a window that has already come back. Neither is displayable, and an
    // absent detail costs far less than a confident wrong one.
    expect(withReset(NOW / 1000 - 3600)).toBeNull();
    expect(withReset(1_000)).toBeNull();
    expect(withReset(NOW / 1000 + 365 * 24 * 3600)).toBeNull();
  });
});

describe("formatWindowLabel", () => {
  it("names every window the Claude SDK declares, plus Codex's", () => {
    // The list is `SDKRateLimitInfo["rateLimitType"]` verbatim: nothing a
    // current account can report should reach the generic fallback.
    expect(formatWindowLabel("five_hour")).toBe("5-hour limit");
    expect(formatWindowLabel("seven_day")).toBe("Weekly limit");
    expect(formatWindowLabel("seven_day_opus")).toBe("Weekly limit · Opus");
    expect(formatWindowLabel("seven_day_sonnet")).toBe("Weekly limit · Sonnet");
    expect(formatWindowLabel("overage")).toBe("Overage");
    expect(formatWindowLabel("primary")).toBe("Primary limit");
    expect(formatWindowLabel("secondary")).toBe("Secondary limit");
  });
});
