/**
 * Detects the Claude CLI's usage-limit refusals, which arrive as plain
 * ASSISTANT TEXT and nothing else — verified live (29/07/2026) : « You've hit
 * your session limit · resets 12:50pm (Asia/Makassar) » ends the turn without
 * any `rate_limit_event`, so the quota store, the banner and the auto-relay
 * all stay blind exactly when they matter most.
 *
 * The adapter turns a detection into the same `account.rate-limits.updated`
 * event a real rate_limit_event would produce, with `status: "rejected"` —
 * the severity the client already treats as critical.
 */

export interface ClaudeUsageLimitRefusal {
  /** The window the refusal names; mirrors the SDK's `rateLimitType`. */
  readonly windowKind: "five_hour" | "seven_day";
}

/**
 * Refusals are one-liners. A long assistant answer that merely DISCUSSES
 * limits (docs, code reviews about this very feature…) must never trip the
 * detector, so anything beyond one short line is rejected outright.
 */
const MAX_REFUSAL_TEXT_LENGTH = 200;

const REFUSAL_PATTERNS: readonly RegExp[] = [
  /\bhit your\b[^.]*\blimit\b/i,
  /\b(session|usage|weekly|5-hour|five-hour|opus)\s+limit reached\b/i,
];

const WEEKLY_HINT = /\bweek(?:ly)?\b|\bseven[\s-]day\b|\b7[\s-]day\b/i;

export function detectClaudeUsageLimitRefusal(text: string): ClaudeUsageLimitRefusal | null {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_REFUSAL_TEXT_LENGTH) {
    return null;
  }
  if (!REFUSAL_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return null;
  }
  return { windowKind: WEEKLY_HINT.test(trimmed) ? "seven_day" : "five_hour" };
}

/**
 * The payload an adapter should emit for a detection — the exact shape
 * `rateLimitWindowsFromPayload` reads for real Claude events, so everything
 * downstream (store, gauges, banner, relay) works unchanged.
 */
export function synthesizedUsageLimitRateLimitPayload(refusal: ClaudeUsageLimitRefusal): {
  readonly rateLimits: {
    readonly rate_limit_info: {
      readonly status: "rejected";
      readonly rateLimitType: string;
    };
    readonly synthesizedFromRefusalText: true;
  };
} {
  return {
    rateLimits: {
      rate_limit_info: {
        status: "rejected",
        rateLimitType: refusal.windowKind,
      },
      synthesizedFromRefusalText: true,
    },
  };
}
