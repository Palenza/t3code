import type {
  ProviderInstanceId,
  ServerProviderRateLimits,
  ServerProviderRateLimitWindow,
} from "@t3tools/contracts";

import { applyRateLimitEvent, mergeRateLimitWindows } from "./rateLimitSnapshot.ts";

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
 * Notified when a stored snapshot actually changes.
 *
 * The reason this exists at all: without it, a new reading sits in this map
 * until the provider registry happens to re-probe — up to five minutes, and
 * never during the turn that produced it. The gauge would be a number that
 * moves only when the user is not looking.
 *
 * A bare tick, carrying nothing. Subscribers re-read the store themselves, so
 * a burst of events cannot deliver them in a different order than it was
 * written in.
 */
const listeners = new Set<() => void>();

export const subscribeRateLimitChanges = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const notify = (): void => {
  for (const listener of listeners) {
    // One subscriber throwing must not silence the others, nor bubble into the
    // event pipeline that is merely passing through.
    try {
      listener();
    } catch {
      // Intentionally swallowed: a broken subscriber is its own problem.
    }
  }
};

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
  notify();
  return next;
};

/**
 * Folds windows read from the account API into the same store.
 *
 * The second source, and the only one that knows a percentage. It merges with
 * the runtime event's contribution rather than replacing it — see
 * `mergeRateLimitWindows`, where the field-by-field rule lives — so a window
 * ends up carrying the figure from here and the state from there.
 *
 * Same instance key, same notification, so everything downstream (the join at
 * the client boundary, the live push, the gauge) works unchanged.
 */
export const recordAccountUsage = (input: {
  readonly instanceId: ProviderInstanceId;
  readonly windows: readonly ServerProviderRateLimitWindow[];
  readonly observedAt: string;
}): ServerProviderRateLimits | undefined => {
  if (input.windows.length === 0) {
    return undefined;
  }

  const previous = byInstance.get(input.instanceId);
  const next: ServerProviderRateLimits = {
    observedAt: input.observedAt as ServerProviderRateLimits["observedAt"],
    windows: mergeRateLimitWindows(previous?.windows ?? [], input.windows),
  };

  byInstance.set(input.instanceId, next);
  notify();
  return next;
};

export const getRateLimits = (
  instanceId: ProviderInstanceId,
): ServerProviderRateLimits | undefined => byInstance.get(instanceId);

/**
 * Test seam. Never called in production paths.
 *
 * Leaves subscribers in place on purpose: a subscription belongs to the
 * connection that opened it, not to the contents of the store.
 */
export const resetRateLimitStore = (): void => {
  byInstance.clear();
};
