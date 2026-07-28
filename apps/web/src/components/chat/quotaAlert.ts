import type { ServerProvider } from "@t3tools/contracts";

import {
  formatWindowLabel,
  presentProviderRateLimits,
  type RateLimitGauge,
} from "../settings/providerRateLimits";

/**
 * Decides whether the account's quota is worth interrupting someone about.
 *
 * The point of this feature is to be told BEFORE the wall, while there is
 * still time to change plan — finish the current thing, switch account, or
 * stop and come back after the reset. Being told at the wall is not a warning,
 * it is an obituary.
 *
 * The hard part is not the threshold, it is the silence. A banner that appears
 * at 40% teaches people to close banners without reading them, and the one
 * that mattered gets closed with the rest. So: nothing at all until there is
 * something to do about it.
 */

/**
 * Two judgement calls, stated plainly rather than hidden in a condition.
 *
 * 75% — a five-hour window at three quarters still leaves room to finish what
 * is running, which is exactly when a warning is useful and not yet annoying.
 *
 * 90% — the next long turn may not complete. This one earns the loud variant.
 *
 * Both are guesses about attention, not measurements. They live here, as two
 * named constants, so changing our minds costs one line.
 */
const WARNING_AT = 75;
const CRITICAL_AT = 90;

export interface QuotaAlert {
  /**
   * Stable across refreshes so a dismissal sticks — but it carries the level,
   * so a warning that was dismissed comes back once it turns critical. Being
   * silenced at 76% must not mean being silenced at 95%.
   */
  readonly id: string;
  readonly level: "warning" | "critical";
  readonly title: string;
  readonly description: string;
}

const worstGauge = (gauges: ReadonlyArray<RateLimitGauge>): RateLimitGauge | undefined => {
  let worst: RateLimitGauge | undefined;
  for (const gauge of gauges) {
    if (worst === undefined) {
      worst = gauge;
      continue;
    }
    // A window the provider has actually rejected outranks any percentage:
    // it is not "nearly out", it is out.
    const rejected = gauge.tone === "critical" && gauge.percentLabel === null;
    const worstRejected = worst.tone === "critical" && worst.percentLabel === null;
    if (rejected && !worstRejected) {
      worst = gauge;
      continue;
    }
    if (!worstRejected && (gauge.barPercent ?? -1) > (worst.barPercent ?? -1)) {
      worst = gauge;
    }
  }
  return worst;
};

/**
 * The other account to send the next turn to, when there is one.
 *
 * WHAT THIS IS NOT: no token is read, written or swapped, and no client is
 * impersonated. Each account is already a configured provider instance with
 * its own `CLAUDE_CONFIG_DIR`, signed in the ordinary way with
 * `claude auth login`. Switching means running the next turn on the other
 * instance — the official CLI, pointed at the other subscription.
 *
 * Proxies that re-use Claude Code's own OAuth client id to serve arbitrary API
 * traffic from a subscription solve this differently and put both accounts at
 * risk. This does the same job with none of that.
 */
export const resolveQuotaSwitchTarget = (input: {
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly active: ServerProvider | null;
  readonly now: number;
}): ServerProvider | null => {
  const active = input.active;
  if (!active) {
    return null;
  }

  const candidates = input.providers
    .filter(
      (provider) =>
        // Same driver: a Claude limit is answered by another Claude account,
        // never by silently moving the work to a different model family.
        provider.driver === active.driver &&
        provider.instanceId !== active.instanceId &&
        provider.enabled &&
        provider.installed &&
        provider.status === "ready" &&
        provider.auth.status === "authenticated",
    )
    .map((provider) => {
      const presented = presentProviderRateLimits({
        rateLimits: provider.rateLimits,
        now: input.now,
      });
      const gauge = presented === null ? undefined : worstGauge(presented.gauges);
      return {
        provider,
        // `null` means "this account has not reported yet" — unknown, which is
        // not the same as free. It is still a candidate, but it never outranks
        // an account we can see is comfortable.
        worst:
          gauge === undefined
            ? null
            : (gauge.barPercent ?? (gauge.percentLabel === null ? 100 : 0)),
        rejected: gauge?.severityLabel === "limit reached",
      };
    })
    // Sending someone from one wall into another is worse than saying nothing.
    .filter((candidate) => !candidate.rejected && (candidate.worst ?? 0) < CRITICAL_AT);

  if (candidates.length === 0) {
    return null;
  }

  // Known-and-comfortable first, unknown after. Preferring an account whose
  // state we can see keeps the suggestion honest.
  const ranked = [...candidates].sort((left, right) => {
    if (left.worst === null && right.worst === null) return 0;
    if (left.worst === null) return 1;
    if (right.worst === null) return -1;
    return left.worst - right.worst;
  });

  return ranked[0]?.provider ?? null;
};

export const resolveQuotaAlert = (input: {
  readonly provider: ServerProvider | null;
  readonly now: number;
}): QuotaAlert | null => {
  const provider = input.provider;
  if (!provider) {
    return null;
  }

  // Reuses the settings presentation deliberately: same freshness rule, same
  // window names, same reset wording. Two places computing "how much is left"
  // would eventually disagree, and the reader would have no way to know which
  // one to believe.
  const presented = presentProviderRateLimits({
    rateLimits: provider.rateLimits,
    now: input.now,
  });
  if (presented === null) {
    return null;
  }

  const gauge = worstGauge(presented.gauges);
  if (gauge === undefined) {
    return null;
  }

  const accountName = provider.displayName?.trim() || "Claude";
  const windowName = formatWindowLabel(gauge.kind);
  const resets = gauge.resetLabel ? gauge.resetLabel.replace(/^resets /, "Resets ") : null;

  // Rejected: the provider itself says no. Percentage irrelevant.
  if (gauge.percentLabel === null) {
    return gauge.severityLabel === "limit reached"
      ? {
          id: `quota:${provider.instanceId}:${gauge.kind}:critical`,
          level: "critical",
          title: `${accountName} — ${windowName.toLowerCase()} reached`,
          description: resets
            ? `${resets}. Another account, or waiting, are the two ways through.`
            : "Another account, or waiting, are the two ways through.",
        }
      : null;
  }

  const percent = gauge.barPercent ?? 0;
  if (percent < WARNING_AT) {
    return null;
  }

  const level = percent >= CRITICAL_AT ? "critical" : "warning";
  return {
    id: `quota:${provider.instanceId}:${gauge.kind}:${level}`,
    level,
    title: `${accountName} — ${windowName.toLowerCase()} at ${gauge.percentLabel}`,
    description: resets
      ? `${resets}. ${
          level === "critical"
            ? "A long turn may not finish before the limit."
            : "Worth finishing what is running before starting something long."
        }`
      : level === "critical"
        ? "A long turn may not finish before the limit."
        : "Worth finishing what is running before starting something long.",
  };
};
