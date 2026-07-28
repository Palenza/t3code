import type { ServerProviderRateLimitWindow } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";

/**
 * Reads Claude's subscription usage from the account API.
 *
 * WHY THIS EXISTS. The runtime event the SDK emits during a turn carries the
 * window, its status and when it resets — but no percentage. Verified on a
 * live turn (28/07/2026): `rate_limit_info` was `{ status, resetsAt,
 * rateLimitType, overage* }` and nothing else. The figure people actually want
 * ("am I at 9% or 90%?") only exists here.
 *
 * Real response, captured the same day (trimmed):
 *
 *   { "five_hour": { "utilization": 9.0, "resets_at": "2026-07-28T04:10:00…Z" },
 *     "seven_day": { "utilization": 13.0, "resets_at": "2026-07-28T12:59:59…Z" },
 *     "seven_day_opus": null, "seven_day_sonnet": null, …
 *     "limits": [ … ], "spend": { … }, "extra_usage": { … } }
 *
 * That capture also settled a question the contract had left open: its
 * `five_hour.resets_at` is 04:10 UTC, the exact instant the SDK's
 * `resetsAt: 1785211800` denotes when read as SECONDS. Two independent sources
 * agreeing is what turned a plausible unit guess into a known one.
 */

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

/** The header the CLI sends; the endpoint answers 401 without it. */
const OAUTH_BETA = "oauth-2025-04-20";

/** A quota answer that arrives late is worth nothing, and the turn is gone. */
const TIMEOUT_MS = 10_000;

/**
 * Windows are discovered, not enumerated. The response ships a dozen named
 * slots that are `null` today (`seven_day_opus`, `tangelo`, `nimbus_quill`…);
 * a hard-coded list would silently ignore whichever one Anthropic switches on
 * next, and the gauge would quietly stop telling the whole truth.
 *
 * These three keys are the documented non-windows and are skipped by name:
 * `limits` is a redundant flattening of the same figures, `spend` is money
 * rather than a quota, and `extra_usage` counts purchased credits — a
 * different thing that would mislead under the same bar.
 */
const NOT_A_WINDOW = new Set(["limits", "spend", "extra_usage"]);

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * ISO instant to epoch SECONDS — the unit the SDK uses in the same field, so
 * both sources land in `resetsAtEpoch` speaking the same language.
 *
 * Converting is safe here in a way it was not at the contract: an ISO string
 * carries its own unit, so nothing is being guessed.
 *
 * TRUNCATED, not rounded, and that one character matters. This endpoint sends
 * sub-second precision (`04:10:00.864821`) while the SDK sends `1785211800`
 * for the same instant. Rounding would produce 1785211801 here, and the two
 * sources would then disagree by a second about a five-hour window — enough to
 * make the merge write a new value on every refresh, for a difference no
 * reader could ever see.
 */
const toEpochSeconds = (value: unknown): number | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : Math.floor(parsed / 1000);
};

export const claudeUsageWindows = (payload: unknown): ServerProviderRateLimitWindow[] => {
  if (!isRecord(payload)) {
    return [];
  }

  const windows: ServerProviderRateLimitWindow[] = [];
  for (const [kind, value] of Object.entries(payload)) {
    if (NOT_A_WINDOW.has(kind) || !isRecord(value)) {
      continue;
    }
    const utilization = value.utilization;
    if (typeof utilization !== "number" || !Number.isFinite(utilization)) {
      continue;
    }
    const resetsAtEpoch = toEpochSeconds(value.resets_at);
    windows.push({
      kind,
      utilization,
      ...(resetsAtEpoch !== undefined ? { resetsAtEpoch } : {}),
    });
  }
  return windows;
  // `severity` is deliberately not read from this source. It reports
  // "normal" here, where the runtime event reports the SDK's own
  // `allowed | allowed_warning | rejected`. Two vocabularies in one field
  // would make the colour mean different things depending on which source
  // last wrote, and "normal" adds nothing the percentage does not already say.
};

export type ClaudeUsageOutcome =
  | { readonly _tag: "windows"; readonly windows: ServerProviderRateLimitWindow[] }
  /** The credential was refused — we stopped knowing, and must say so. */
  | { readonly _tag: "refused"; readonly status: number }
  /** Network, timeout, unreadable body: unknown, not zero. */
  | { readonly _tag: "unreachable"; readonly detail: string };

/**
 * Fetches usage for one account.
 *
 * Never throws and never returns a figure it did not receive: the caller gets
 * one of three answers, and two of them mean "no change to what is stored".
 * A frozen percentage that keeps looking current is the exact failure this
 * whole feature exists to prevent.
 *
 * The token is never logged and never put in a URL.
 */
export const fetchClaudeUsage = Effect.fn("fetchClaudeUsage")(function* (input: {
  readonly accessToken: string;
}): Effect.fn.Return<ClaudeUsageOutcome, never, HttpClient.HttpClient> {
  const client = yield* HttpClient.HttpClient;
  const request = HttpClientRequest.get(USAGE_URL).pipe(
    HttpClientRequest.setHeader("authorization", `Bearer ${input.accessToken}`),
    HttpClientRequest.setHeader("anthropic-beta", OAUTH_BETA),
    HttpClientRequest.setHeader("accept", "application/json"),
  );

  const response = yield* client.execute(request).pipe(
    Effect.timeout(TIMEOUT_MS),
    Effect.map((value) => ({ ok: true as const, value })),
    Effect.orElseSucceed(() => ({ ok: false as const })),
  );

  if (!response.ok) {
    return { _tag: "unreachable", detail: "request failed or timed out" };
  }
  if (response.value.status < 200 || response.value.status >= 300) {
    return { _tag: "refused", status: response.value.status };
  }

  const payload = yield* response.value.json.pipe(Effect.orElseSucceed(() => undefined));
  if (payload === undefined) {
    return { _tag: "unreachable", detail: "response body was not JSON" };
  }
  return { _tag: "windows", windows: claudeUsageWindows(payload) };
});
