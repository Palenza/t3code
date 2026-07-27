import type { ServerProviderRateLimitWindow, ServerProviderRateLimits } from "@t3tools/contracts";

/**
 * Turns a provider's `account.rate-limits.updated` payload into the single
 * normalised shape the UI renders.
 *
 * Two providers, two unrelated payloads (see `AccountRateLimitsUpdatedPayload`
 * in the contracts package), and one non-obvious difference between them that
 * drives this whole module:
 *
 *   - Claude reports ONE window per event, named by `rateLimitType`. Its
 *     five-hour and seven-day figures arrive in separate messages, minutes
 *     apart.
 *   - Codex reports its full snapshot every time (`primary` + `secondary`).
 *
 * So a snapshot cannot be replaced wholesale on each event: doing that would
 * make Claude's sidebar flicker between "5h only" and "7d only" forever,
 * never showing both. Hence `mergeRateLimitWindows`, which merges by `kind`.
 */

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asFiniteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const asNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const SEVERITIES = new Set(["allowed", "allowed_warning", "rejected"]);

const asSeverity = (value: unknown): ServerProviderRateLimitWindow["severity"] => {
  const text = asNonEmptyString(value);
  return text !== undefined && SEVERITIES.has(text)
    ? (text as ServerProviderRateLimitWindow["severity"])
    : undefined;
};

/**
 * Claude: `{ rate_limit_info: { status, rateLimitType, utilization, resetsAt } }`.
 *
 * `utilization` is checked against undefined rather than falsiness: 0 is the
 * value a fresh account reports, and treating it as missing would turn "you
 * have used nothing" into "we know nothing".
 */
const windowsFromClaude = (rateLimits: UnknownRecord): ServerProviderRateLimitWindow[] => {
  const info = rateLimits.rate_limit_info;
  if (!isRecord(info)) {
    return [];
  }

  const utilization = asFiniteNumber(info.utilization);
  if (utilization === undefined) {
    return [];
  }

  const resetsAtEpoch = asFiniteNumber(info.resetsAt);
  const severity = asSeverity(info.status);

  return [
    {
      // Falls back to a generic label instead of dropping the window: an
      // unnamed limit at 90% is still worth showing.
      kind: asNonEmptyString(info.rateLimitType) ?? "limit",
      utilization,
      ...(severity !== undefined ? { severity } : {}),
      ...(resetsAtEpoch !== undefined ? { resetsAtEpoch } : {}),
    },
  ];
};

/**
 * Codex: `{ rateLimits: { primary, secondary, … } }`, each window carrying
 * `usedPercent` and an optional `resetsAt`.
 */
const windowsFromCodex = (rateLimits: UnknownRecord): ServerProviderRateLimitWindow[] => {
  const snapshot = rateLimits.rateLimits;
  if (!isRecord(snapshot)) {
    return [];
  }

  const windows: ServerProviderRateLimitWindow[] = [];
  for (const key of ["primary", "secondary"] as const) {
    const raw = snapshot[key];
    if (!isRecord(raw)) {
      continue;
    }
    const utilization = asFiniteNumber(raw.usedPercent);
    if (utilization === undefined) {
      continue;
    }
    const resetsAtEpoch = asFiniteNumber(raw.resetsAt);
    windows.push({
      kind: key,
      utilization,
      ...(resetsAtEpoch !== undefined ? { resetsAtEpoch } : {}),
    });
  }
  return windows;
};

/**
 * Returns `[]` when nothing usable is present — never a fabricated 0%.
 * "We received nothing" and "you have used nothing" are different claims and
 * the UI must be able to tell them apart.
 */
export const rateLimitWindowsFromPayload = (payload: unknown): ServerProviderRateLimitWindow[] => {
  if (!isRecord(payload)) {
    return [];
  }
  const rateLimits = payload.rateLimits;
  if (!isRecord(rateLimits)) {
    return [];
  }

  const claude = windowsFromClaude(rateLimits);
  if (claude.length > 0) {
    return claude;
  }
  return windowsFromCodex(rateLimits);
};

/**
 * Merges freshly observed windows over previously known ones, by `kind`.
 *
 * Required because Claude reports one window per event: replacing the whole
 * snapshot would drop the seven-day figure the moment a five-hour update
 * arrives, and the sidebar would never show both at once.
 *
 * Incoming windows win on conflict, and previously known kinds survive. Order
 * is stable — previously known kinds first, in their original order — so the
 * gauges do not reshuffle under the reader between two updates.
 */
export const mergeRateLimitWindows = (
  previous: readonly ServerProviderRateLimitWindow[],
  incoming: readonly ServerProviderRateLimitWindow[],
): ServerProviderRateLimitWindow[] => {
  const byKind = new Map<string, ServerProviderRateLimitWindow>();
  for (const window of previous) {
    byKind.set(window.kind, window);
  }
  for (const window of incoming) {
    byKind.set(window.kind, window);
  }
  return [...byKind.values()];
};

/**
 * Applies one event to an instance's snapshot.
 *
 * Returns `previous` unchanged when the payload yields nothing, so an
 * unparseable event never refreshes `observedAt`. A snapshot must not claim to
 * be more recent than the last figure it actually carries.
 */
export const applyRateLimitEvent = (input: {
  readonly previous: ServerProviderRateLimits | undefined;
  readonly payload: unknown;
  readonly observedAt: string;
}): ServerProviderRateLimits | undefined => {
  const incoming = rateLimitWindowsFromPayload(input.payload);
  if (incoming.length === 0) {
    return input.previous;
  }
  return {
    observedAt: input.observedAt as ServerProviderRateLimits["observedAt"],
    windows: mergeRateLimitWindows(input.previous?.windows ?? [], incoming),
  };
};
