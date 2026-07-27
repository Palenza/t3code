import type { ServerProvider, ServerProviderRateLimitWindow } from "@t3tools/contracts";

/**
 * Turns the subscription usage a provider reported into something renderable.
 *
 * Kept apart from the component because every judgement in here is one a
 * reader could be misled by — an inferred unit, a clamped bar, a figure with
 * no date on it — and those deserve tests rather than a code review of JSX.
 */

/** Above this, the account is close enough to the wall to say so. */
const WARNING_AT = 50;
/** Above this, it is the next thing that will interrupt the user. */
const CRITICAL_AT = 85;

/**
 * A reading older than this is dropped rather than shown.
 *
 * The realistic source of one is the client's own cached config, replayed
 * before the live snapshot lands after a reconnect. Every window a provider
 * reports has moved by then, so the number describes nothing. Below this age
 * the figure is still shown — always with its age attached, never bare.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Separates an epoch in seconds from one in milliseconds.
 *
 * The contract carries the provider's raw number because the Claude Agent SDK
 * types `resetsAt` as `number` and documents no unit; seconds and milliseconds
 * differ by a factor of 1000, and guessing at the contract would bake one
 * guess into every consumer. The guess belongs here, at the last step, where
 * it can be checked: `1e11` is 1973 read as milliseconds and the year 5138
 * read as seconds, so no real timestamp is ambiguous.
 *
 * The magnitude test alone is not enough to render on. A wrong guess lands the
 * instant in 1970 or in the far future, which is why `formatReset` also
 * demands the result be plausible — near future, days not decades — before
 * showing anything. Both have to agree, or the reset time is simply not
 * displayed. An absent reset time costs the reader a detail; a wrong one costs
 * them the trust they had in the whole gauge.
 */
export const resolveResetInstant = (resetsAtEpoch: number): number | null => {
  if (!Number.isFinite(resetsAtEpoch) || resetsAtEpoch <= 0) {
    return null;
  }
  return resetsAtEpoch >= 1e11 ? resetsAtEpoch : resetsAtEpoch * 1000;
};

/**
 * The Claude entries are every value `SDKRateLimitInfo["rateLimitType"]`
 * declares (`@anthropic-ai/claude-agent-sdk` 0.3.170, checked 2026-07-28), so
 * nothing a current account can report falls through to the generic label.
 */
const KNOWN_WINDOW_LABELS: Record<string, string> = {
  five_hour: "5-hour limit",
  seven_day: "Weekly limit",
  seven_day_opus: "Weekly limit · Opus",
  seven_day_sonnet: "Weekly limit · Sonnet",
  overage: "Overage",
  // Codex names its windows by rank rather than by duration.
  primary: "Primary limit",
  secondary: "Secondary limit",
};

/**
 * Unrecognised kinds are prettified, never dropped: providers add windows
 * without warning, and an unnamed limit at 90% is still worth showing.
 */
export const formatWindowLabel = (kind: string): string => {
  const known = KNOWN_WINDOW_LABELS[kind];
  if (known !== undefined) {
    return known;
  }
  const words = kind.replace(/[_-]+/g, " ").trim();
  return words.length === 0 ? "Limit" : words.charAt(0).toUpperCase() + words.slice(1);
};

export type RateLimitTone = "normal" | "warning" | "critical";

/**
 * Severity, when the provider states one, outranks the percentage: a provider
 * saying "rejected" knows something the number alone does not.
 */
export const resolveTone = (window: ServerProviderRateLimitWindow): RateLimitTone => {
  if (window.severity === "rejected") {
    return "critical";
  }
  if (window.severity === "allowed_warning") {
    return "warning";
  }
  if (window.utilization >= CRITICAL_AT) {
    return "critical";
  }
  return window.utilization >= WARNING_AT ? "warning" : "normal";
};

const formatAge = (ageMs: number): string => {
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "1 h ago" : `${hours} h ago`;
};

const formatReset = (input: {
  readonly resetsAtEpoch: number | undefined;
  readonly now: number;
}): string | null => {
  if (input.resetsAtEpoch === undefined) {
    return null;
  }
  const instant = resolveResetInstant(input.resetsAtEpoch);
  if (instant === null) {
    return null;
  }
  const remainingMs = instant - input.now;
  // Already elapsed, or so far out that the unit guess must have been wrong.
  // Sixty days is past every window any provider currently advertises.
  if (remainingMs <= 0 || remainingMs > 60 * 24 * 60 * 60 * 1000) {
    return null;
  }
  const minutes = Math.round(remainingMs / 60_000);
  if (minutes < 60) {
    return minutes <= 1 ? "resets in under a minute" : `resets in ${minutes} min`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return hours === 1 ? "resets in about 1 h" : `resets in about ${hours} h`;
  }
  return `resets in about ${Math.round(hours / 24)} days`;
};

export interface RateLimitGauge {
  readonly kind: string;
  readonly label: string;
  /** As reported, never clamped — a provider saying 103% is saying something. */
  readonly percentLabel: string;
  /** Clamped to 0–100, because a bar cannot be 103% long. */
  readonly barPercent: number;
  readonly tone: RateLimitTone;
  readonly resetLabel: string | null;
}

export interface RateLimitPresentation {
  readonly gauges: ReadonlyArray<RateLimitGauge>;
  /** Never optional in the render: a quota with no date is a claim with no date. */
  readonly observedLabel: string;
}

export const presentProviderRateLimits = (input: {
  readonly rateLimits: ServerProvider["rateLimits"];
  readonly now: number;
}): RateLimitPresentation | null => {
  const rateLimits = input.rateLimits;
  if (rateLimits === undefined || rateLimits.windows.length === 0) {
    return null;
  }

  const observedAt = Date.parse(rateLimits.observedAt);
  if (Number.isNaN(observedAt)) {
    return null;
  }
  const ageMs = input.now - observedAt;
  // A clock skewed into the future is not a reason to hide a reading, but an
  // old one is: see MAX_AGE_MS.
  if (ageMs > MAX_AGE_MS) {
    return null;
  }

  return {
    gauges: rateLimits.windows.map((window) => ({
      kind: window.kind,
      label: formatWindowLabel(window.kind),
      percentLabel: `${Math.round(window.utilization)}%`,
      barPercent: Math.max(0, Math.min(100, window.utilization)),
      tone: resolveTone(window),
      resetLabel: formatReset({ resetsAtEpoch: window.resetsAtEpoch, now: input.now }),
    })),
    observedLabel: `measured ${formatAge(Math.max(0, ageMs))}`,
  };
};
