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
 * Claude: `{ rate_limit_info: { status, rateLimitType, utilization?, resetsAt? } }`.
 *
 * The percentage is OPTIONAL, and pretending otherwise cost this feature a
 * day. Verbatim from a real turn on a Max subscription (28/07/2026):
 *
 *   { status: "allowed", resetsAt: 1785211800, rateLimitType: "five_hour",
 *     overageStatus: "rejected", overageDisabledReason: "org_level_disabled",
 *     isUsingOverage: false }
 *
 * No `utilization` anywhere. An earlier version returned `[]` in that case,
 * so every event was dropped and the account rendered nothing at all — the
 * failure looked exactly like "the provider never reported".
 *
 * So a window is kept as soon as the provider says something identifiable
 * about it. `utilization` is still checked against undefined rather than
 * falsiness: 0 is what a fresh account reports, and treating it as missing
 * would turn "you have used nothing" into "we know nothing".
 */
const windowsFromClaude = (rateLimits: UnknownRecord): ServerProviderRateLimitWindow[] => {
  const info = rateLimits.rate_limit_info;
  if (!isRecord(info)) {
    return [];
  }

  const kind = asNonEmptyString(info.rateLimitType);
  const utilization = asFiniteNumber(info.utilization);
  const resetsAtEpoch = asFiniteNumber(info.resetsAt);
  const severity = asSeverity(info.status);

  // Nothing identifiable at all — not even which window this is about. A
  // nameless entry carrying no figure and no reset would render as a row that
  // says nothing.
  if (kind === undefined && utilization === undefined && resetsAtEpoch === undefined) {
    return [];
  }

  return [
    {
      // Falls back to a generic label instead of dropping the window: an
      // unnamed limit at 90% is still worth showing.
      kind: kind ?? "limit",
      ...(utilization !== undefined ? { utilization } : {}),
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
 * FIELD BY FIELD, not window by window — and that distinction is the whole
 * reason two sources can coexist. The same `five_hour` window is described by
 * both, each holding what the other lacks:
 *
 *   - the runtime event carries `severity` (and a reset), never a percentage;
 *   - the account API carries `utilization` (and a reset), never a severity.
 *
 * Replacing wholesale would make each new arrival erase the other's only
 * contribution, and the gauge would flip between "82%, state unknown" and
 * "state known, no figure" forever.
 *
 * Incoming fields win where present; previously known ones survive. Order is
 * stable — previously known kinds first, in their original order — so the
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
    const known = byKind.get(window.kind);
    byKind.set(
      window.kind,
      known === undefined
        ? window
        : {
            ...known,
            ...window,
            // Spreading is not enough: an absent key and a key set to
            // `undefined` are different to the spread operator only if the key
            // is missing entirely, and these objects are built with
            // conditional spreads. Restating each optional field keeps a
            // source that says nothing about it from erasing what the other
            // knew.
            ...(window.utilization === undefined && known.utilization !== undefined
              ? { utilization: known.utilization }
              : {}),
            ...(window.severity === undefined && known.severity !== undefined
              ? { severity: known.severity }
              : {}),
            ...(window.resetsAtEpoch === undefined && known.resetsAtEpoch !== undefined
              ? { resetsAtEpoch: known.resetsAtEpoch }
              : {}),
          },
    );
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
