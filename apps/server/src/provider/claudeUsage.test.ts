import { describe, expect, it } from "vite-plus/test";

import { claudeUsageWindows } from "./claudeUsage.ts";

/**
 * The fixture below is the response `https://api.anthropic.com/api/oauth/usage`
 * actually returned on 28/07/2026 for a Max subscription, trimmed of the dozen
 * null slots but otherwise verbatim. Written from a capture rather than from
 * documentation on purpose: the previous parser in this feature was written
 * from a type declaration, assumed an optional field was always present, and
 * silently dropped every event for a day.
 */
const REAL_RESPONSE = {
  five_hour: {
    utilization: 9.0,
    resets_at: "2026-07-28T04:10:00.864821+00:00",
    limit_dollars: null,
    used_dollars: null,
    remaining_dollars: null,
  },
  seven_day: {
    utilization: 13.0,
    resets_at: "2026-07-28T12:59:59.864850+00:00",
    limit_dollars: null,
    used_dollars: null,
    remaining_dollars: null,
  },
  seven_day_opus: null,
  seven_day_sonnet: null,
  tangelo: null,
  extra_usage: {
    is_enabled: false,
    monthly_limit: null,
    used_credits: null,
    utilization: null,
    currency: null,
  },
  limits: [
    {
      kind: "session",
      group: "session",
      percent: 9,
      severity: "normal",
      resets_at: "2026-07-28T04:10:00.864821+00:00",
      scope: null,
      is_active: false,
    },
    {
      kind: "weekly_all",
      group: "weekly",
      percent: 13,
      severity: "normal",
      resets_at: "2026-07-28T12:59:59.864850+00:00",
      scope: null,
      is_active: true,
    },
  ],
  spend: {
    used: { amount_minor: 0, currency: "USD", exponent: 2 },
    percent: 0,
    severity: "normal",
    enabled: false,
  },
  member_dashboard_available: false,
};

describe("claudeUsageWindows", () => {
  it("reads the response the account API actually returns", () => {
    const windows = claudeUsageWindows(REAL_RESPONSE);

    expect(windows).toEqual([
      // Epoch SECONDS, the unit the runtime event uses in the same field, so
      // both sources speak the same language once they meet in the store.
      { kind: "five_hour", utilization: 9, resetsAtEpoch: 1_785_211_800 },
      { kind: "seven_day", utilization: 13, resetsAtEpoch: 1_785_243_599 },
    ]);
  });

  it("agrees with the runtime event on when the window resets", () => {
    // The cross-check that settled the unit question. A live turn the same day
    // reported `resetsAt: 1785211800`; this endpoint independently says
    // 04:10 UTC. They are the same instant only if the SDK number is seconds.
    const [fiveHour] = claudeUsageWindows(REAL_RESPONSE);

    // 1785211800 s = 2026-07-28T04:10:00Z, which is what `resets_at` says
    // above once its sub-second part is dropped.
    expect(fiveHour?.resetsAtEpoch).toBe(1_785_211_800);
    expect(Math.floor(Date.parse("2026-07-28T04:10:00.864821+00:00") / 1000)).toBe(1_785_211_800);
  });

  it("ignores the parts of the response that are not quota windows", () => {
    // `limits` restates the same figures, `spend` is money, and `extra_usage`
    // counts purchased credits — a different thing that would mislead under
    // the same bar.
    const kinds = claudeUsageWindows(REAL_RESPONSE).map((window) => window.kind);

    expect(kinds).not.toContain("limits");
    expect(kinds).not.toContain("spend");
    expect(kinds).not.toContain("extra_usage");
  });

  it("picks up a window Anthropic switches on later", () => {
    // The response ships a dozen named slots sitting at null. Enumerating the
    // ones that happen to be live today would mean the gauge quietly stops
    // telling the whole truth the day one of them starts reporting.
    const windows = claudeUsageWindows({
      ...REAL_RESPONSE,
      seven_day_opus: { utilization: 44, resets_at: "2026-07-28T12:59:59+00:00" },
    });

    expect(windows.map((window) => window.kind)).toContain("seven_day_opus");
    expect(windows.find((window) => window.kind === "seven_day_opus")?.utilization).toBe(44);
  });

  it("keeps a zero and refuses a null", () => {
    // 0% is what a fresh window reports; null is "no such window". Treating
    // them alike would either invent a quota or hide a real one.
    const windows = claudeUsageWindows({
      five_hour: { utilization: 0, resets_at: "2026-07-28T04:10:00+00:00" },
      seven_day: null,
      seven_day_opus: { utilization: null },
    });

    expect(windows).toHaveLength(1);
    expect(windows[0]?.utilization).toBe(0);
  });

  it("keeps a window whose reset time is unusable rather than dropping it", () => {
    const windows = claudeUsageWindows({
      five_hour: { utilization: 61, resets_at: "pas une date" },
    });

    expect(windows).toEqual([{ kind: "five_hour", utilization: 61 }]);
  });

  it("returns nothing for a body that is not a usage response", () => {
    expect(claudeUsageWindows(null)).toEqual([]);
    expect(claudeUsageWindows("<html>login</html>")).toEqual([]);
    expect(claudeUsageWindows({ error: { type: "authentication_error" } })).toEqual([]);
  });
});
