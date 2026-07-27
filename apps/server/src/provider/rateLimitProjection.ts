import type { ServerProvider } from "@t3tools/contracts";

import { getRateLimits } from "./rateLimitStore.ts";

/**
 * Joins the live subscription-usage store onto provider snapshots on their way
 * out to a client.
 *
 * One join, at the boundary, rather than one per driver. Three reasons, in
 * order of how much they cost when ignored:
 *
 *  1. **Freshness.** A provider snapshot is produced by a probe that answers
 *     "is this installed and authenticated", on a five-minute schedule. Usage
 *     arrives from the event stream during a turn. A figure stamped at probe
 *     time is already minutes old by the time it is read; joined here it is
 *     the last thing known before the bytes leave.
 *  2. **Staleness, which is worse than absence.** Probe snapshots are cached
 *     on disk and re-read at boot. A quota stamped into that snapshot would
 *     come back after a restart describing a window that has since reset —
 *     the store is deliberately process-local for exactly that reason. Here,
 *     the store is the only authority: a snapshot arriving with a `rateLimits`
 *     from anywhere else has it stripped rather than trusted.
 *  3. **Fork cost.** The per-driver version needed the same three lines in
 *     five driver files, each of which the upstream touches. This file is ours
 *     alone and merges clean.
 *
 * Absent stays absent: a provider that has never reported gets no key at all,
 * never a zero. "Nothing reported yet" and "you have used nothing" are
 * different claims and the UI has to be able to tell them apart.
 */
export const withCurrentRateLimits = (
  providers: ReadonlyArray<ServerProvider>,
): ReadonlyArray<ServerProvider> =>
  providers.map((provider) => {
    const rateLimits = getRateLimits(provider.instanceId);
    if (rateLimits !== undefined) {
      return { ...provider, rateLimits };
    }
    if (provider.rateLimits === undefined) {
      return provider;
    }
    // Carried in from somewhere that is not the live store — a hydrated disk
    // cache, most likely. Drop it: an old reading rendered as a current one is
    // the failure this whole path exists to prevent.
    const { rateLimits: _stale, ...withoutRateLimits } = provider;
    return withoutRateLimits;
  });
