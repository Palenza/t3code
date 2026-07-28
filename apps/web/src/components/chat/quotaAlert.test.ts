import type { ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveQuotaAlert, resolveQuotaSwitchTarget } from "./quotaAlert";

const NOW = Date.parse("2026-07-28T00:00:00.000Z");

const account = (input: {
  readonly instanceId: string;
  readonly displayName?: string;
  readonly driver?: string;
  readonly status?: string;
  readonly authStatus?: string;
  readonly enabled?: boolean;
  readonly windows?: ReadonlyArray<Record<string, unknown>>;
}): ServerProvider =>
  ({
    instanceId: input.instanceId,
    driver: input.driver ?? "claudeAgent",
    displayName: input.displayName ?? input.instanceId,
    enabled: input.enabled ?? true,
    installed: true,
    status: input.status ?? "ready",
    auth: { status: input.authStatus ?? "authenticated" },
    checkedAt: "2026-07-28T00:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    ...(input.windows
      ? { rateLimits: { observedAt: "2026-07-28T00:00:00.000Z", windows: input.windows } }
      : {}),
  }) as never;

const provider = (windows: ReadonlyArray<Record<string, unknown>>): ServerProvider =>
  ({
    instanceId: "claude-default",
    driver: "claudeAgent",
    displayName: "Claude",
    enabled: true,
    installed: true,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-07-28T00:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    rateLimits: { observedAt: "2026-07-28T00:00:00.000Z", windows },
  }) as never;

describe("resolveQuotaAlert", () => {
  it("says nothing while there is nothing to do about it", () => {
    // The whole value of this alert is that it is rare. A banner at 40% would
    // teach people to close banners unread, and the one that mattered would be
    // closed with the rest.
    expect(resolveQuotaAlert({ provider: provider([]), now: NOW })).toBeNull();
    expect(
      resolveQuotaAlert({
        provider: provider([{ kind: "five_hour", utilization: 74 }]),
        now: NOW,
      }),
    ).toBeNull();
    expect(resolveQuotaAlert({ provider: null, now: NOW })).toBeNull();
  });

  it("warns while there is still room to finish something", () => {
    const alert = resolveQuotaAlert({
      provider: provider([
        { kind: "five_hour", utilization: 78, resetsAtEpoch: NOW / 1000 + 3 * 3600 },
      ]),
      now: NOW,
    });

    expect(alert?.level).toBe("warning");
    expect(alert?.title).toBe("Claude — 5-hour limit at 78%");
    expect(alert?.description).toContain("Resets in about 3 h");
  });

  it("turns loud when the next long turn may not finish", () => {
    const alert = resolveQuotaAlert({
      provider: provider([{ kind: "seven_day", utilization: 93 }]),
      now: NOW,
    });

    expect(alert?.level).toBe("critical");
    expect(alert?.title).toBe("Claude — weekly limit at 93%");
  });

  it("comes back after a dismissal once the situation gets worse", () => {
    // The id carries the level on purpose. Being silenced at 76% must not mean
    // being silenced at 95% — that is how a warning system becomes furniture.
    const warned = resolveQuotaAlert({
      provider: provider([{ kind: "five_hour", utilization: 78 }]),
      now: NOW,
    });
    const critical = resolveQuotaAlert({
      provider: provider([{ kind: "five_hour", utilization: 96 }]),
      now: NOW,
    });

    expect(warned?.id).not.toBe(critical?.id);
  });

  it("keeps the same identity while the figure drifts within a level", () => {
    // Otherwise every refresh would resurrect a banner the reader just closed.
    const first = resolveQuotaAlert({
      provider: provider([{ kind: "five_hour", utilization: 78 }]),
      now: NOW,
    });
    const later = resolveQuotaAlert({
      provider: provider([{ kind: "five_hour", utilization: 81 }]),
      now: NOW,
    });

    expect(first?.id).toBe(later?.id);
  });

  it("speaks about the window closest to its limit", () => {
    const alert = resolveQuotaAlert({
      provider: provider([
        { kind: "five_hour", utilization: 12 },
        { kind: "seven_day", utilization: 91 },
      ]),
      now: NOW,
    });

    expect(alert?.title).toContain("weekly limit");
  });

  it("lets a refusal outrank any percentage", () => {
    // "Rejected" is not "nearly out", it is out — even next to a window
    // sitting at a comfortable number.
    const alert = resolveQuotaAlert({
      provider: provider([
        { kind: "seven_day", utilization: 88 },
        { kind: "five_hour", severity: "rejected", resetsAtEpoch: NOW / 1000 + 2 * 3600 },
      ]),
      now: NOW,
    });

    expect(alert?.level).toBe("critical");
    expect(alert?.title).toBe("Claude — 5-hour limit reached");
    expect(alert?.description).toContain("Resets in about 2 h");
  });

  it("stays quiet on a reading too old to act on", () => {
    // Same freshness rule as the gauge: a figure from yesterday describes a
    // window that has since reset, and interrupting someone over it is worse
    // than saying nothing.
    const stale = {
      ...provider([{ kind: "five_hour", utilization: 99 }]),
      rateLimits: {
        observedAt: "2026-07-26T00:00:00.000Z",
        windows: [{ kind: "five_hour", utilization: 99 }],
      },
    } as ServerProvider;

    expect(resolveQuotaAlert({ provider: stale, now: NOW })).toBeNull();
  });
});

describe("resolveQuotaSwitchTarget", () => {
  const exhausted = account({
    instanceId: "claude-a",
    displayName: "Compte A",
    windows: [{ kind: "five_hour", utilization: 97 }],
  });

  it("proposes the other account when this one is at the wall", () => {
    const fresh = account({
      instanceId: "claude-b",
      displayName: "Compte B",
      windows: [{ kind: "five_hour", utilization: 4 }],
    });

    const target = resolveQuotaSwitchTarget({
      providers: [exhausted, fresh],
      active: exhausted,
      now: NOW,
    });

    expect(target?.instanceId).toBe("claude-b");
  });

  it("never sends someone from one wall into another", () => {
    const alsoExhausted = account({
      instanceId: "claude-b",
      windows: [{ kind: "five_hour", utilization: 95 }],
    });

    expect(
      resolveQuotaSwitchTarget({
        providers: [exhausted, alsoExhausted],
        active: exhausted,
        now: NOW,
      }),
    ).toBeNull();
  });

  it("refuses to answer a Claude limit with a different model family", () => {
    // Quietly moving the work to another provider would change the answer the
    // user gets, without them asking for it.
    const codex = account({ instanceId: "codex-default", driver: "codex" });

    expect(
      resolveQuotaSwitchTarget({ providers: [exhausted, codex], active: exhausted, now: NOW }),
    ).toBeNull();
  });

  it("ignores accounts that cannot actually run a turn", () => {
    const signedOut = account({ instanceId: "claude-b", authStatus: "unauthenticated" });
    const off = account({ instanceId: "claude-c", enabled: false });
    const broken = account({ instanceId: "claude-d", status: "error" });

    expect(
      resolveQuotaSwitchTarget({
        providers: [exhausted, signedOut, off, broken],
        active: exhausted,
        now: NOW,
      }),
    ).toBeNull();
  });

  it("prefers an account it can see over one it knows nothing about", () => {
    // "Never reported" is unknown, not free. It stays a candidate — it may be
    // the only one — but it never outranks an account visibly comfortable.
    const unknown = account({ instanceId: "claude-unknown" });
    const comfortable = account({
      instanceId: "claude-known",
      windows: [{ kind: "five_hour", utilization: 20 }],
    });

    expect(
      resolveQuotaSwitchTarget({
        providers: [exhausted, unknown, comfortable],
        active: exhausted,
        now: NOW,
      })?.instanceId,
    ).toBe("claude-known");
    expect(
      resolveQuotaSwitchTarget({ providers: [exhausted, unknown], active: exhausted, now: NOW })
        ?.instanceId,
    ).toBe("claude-unknown");
  });

  it("takes the roomiest of several", () => {
    const busy = account({
      instanceId: "claude-busy",
      windows: [{ kind: "five_hour", utilization: 70 }],
    });
    const idle = account({
      instanceId: "claude-idle",
      windows: [{ kind: "five_hour", utilization: 3 }],
    });

    expect(
      resolveQuotaSwitchTarget({
        providers: [exhausted, busy, idle],
        active: exhausted,
        now: NOW,
      })?.instanceId,
    ).toBe("claude-idle");
  });

  it("has nothing to propose when there is only one account", () => {
    expect(
      resolveQuotaSwitchTarget({ providers: [exhausted], active: exhausted, now: NOW }),
    ).toBeNull();
    expect(resolveQuotaSwitchTarget({ providers: [], active: null, now: NOW })).toBeNull();
  });
});
