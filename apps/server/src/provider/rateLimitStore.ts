import type { ProviderInstanceId, ServerProviderRateLimits } from "@t3tools/contracts";

import { applyRateLimitEvent } from "./rateLimitSnapshot.ts";

/**
 * Last known subscription usage, per provider instance.
 *
 * Process-local and deliberately not persisted: a quota snapshot is only
 * meaningful while it is fresh, and replaying yesterday's figure on boot would
 * show a confident number that describes nothing. Empty after a restart is the
 * honest state — the next event refills it within a turn.
 *
 * Keyed by instance rather than by driver kind: two Claude instances are two
 * accounts with two independent quotas, and collapsing them onto "claude"
 * would show one account's usage under the other's name.
 */
const byInstance = new Map<ProviderInstanceId, ServerProviderRateLimits>();

/**
 * Folds one runtime event into the store. Safe to call for every event —
 * anything that is not a rate-limit update is ignored.
 *
 * Returns the resulting snapshot, or `undefined` when the event changed
 * nothing, so callers can skip a needless push to the client.
 */
export const recordRateLimitEvent = (event: {
  readonly type: string;
  readonly providerInstanceId?: ProviderInstanceId | undefined;
  readonly payload?: unknown;
  readonly createdAt: string;
}): ServerProviderRateLimits | undefined => {
  if (event.type !== "account.rate-limits.updated") {
    return undefined;
  }

  // Without an instance we cannot say WHICH account this belongs to. Guessing
  // — falling back to the driver kind, or to a single global slot — would
  // attribute one account's usage to another. Dropping is the honest choice.
  const instanceId = event.providerInstanceId;
  if (instanceId === undefined) {
    return undefined;
  }

  const previous = byInstance.get(instanceId);
  const next = applyRateLimitEvent({
    previous,
    payload: event.payload,
    observedAt: event.createdAt,
  });

  if (next === undefined || next === previous) {
    return undefined;
  }

  byInstance.set(instanceId, next);
  return next;
};

export const getRateLimits = (
  instanceId: ProviderInstanceId,
): ServerProviderRateLimits | undefined => byInstance.get(instanceId);

/** Test seam. Never called in production paths. */
export const resetRateLimitStore = (): void => {
  byInstance.clear();
};
