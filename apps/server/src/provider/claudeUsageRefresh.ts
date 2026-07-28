import type { ProviderInstanceId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { HttpClient } from "effect/unstable/http";
import { ChildProcessSpawner } from "effect/unstable/process";

import { readClaudeAccessToken } from "./claudeCredentials.ts";
import { fetchClaudeUsage } from "./claudeUsage.ts";
import { recordAccountUsage } from "./rateLimitStore.ts";

/**
 * Asks the account API for real percentages, on the only clock that matters:
 * the turn that just changed them.
 *
 * WHY THE EVENT AND NOT A TIMER. The runtime event means "this account's usage
 * moved" — it is the exact moment the figure goes stale and the exact moment
 * someone is looking. A periodic poll would spend requests while the user
 * sleeps and still be minutes late during the turn that matters. The trade is
 * explicit: an account that has run nothing since the server started shows no
 * percentage, which is honest — nothing has been reported.
 *
 * Allowed to fail, always. Everything downstream already treats absence as
 * absence, so a failed refresh degrades to exactly what the runtime event
 * alone gives: the window, its state, and when it resets.
 */

/**
 * One refresh per instance per window of time. A turn can emit several
 * rate-limit events, and each would otherwise open its own request for a
 * figure that moves by fractions of a percent.
 */
const THROTTLE_MS = 30_000;

const lastAttemptAt = new Map<ProviderInstanceId, number>();
const inFlight = new Set<ProviderInstanceId>();

export type ClaudeUsageRefreshEnv =
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | HttpClient.HttpClient
  | Path.Path;

export const refreshClaudeUsage = Effect.fn("refreshClaudeUsage")(function* (input: {
  readonly instanceId: ProviderInstanceId;
  /** The instance's `CLAUDE_CONFIG_DIR`, when it sets one. */
  readonly configDir?: string | undefined;
}): Effect.fn.Return<void, never, ClaudeUsageRefreshEnv> {
  const instanceId = input.instanceId;
  const now = DateTime.toEpochMillis(yield* DateTime.now);

  if (inFlight.has(instanceId)) {
    return;
  }
  const previousAttempt = lastAttemptAt.get(instanceId);
  if (previousAttempt !== undefined && now - previousAttempt < THROTTLE_MS) {
    return;
  }
  lastAttemptAt.set(instanceId, now);
  inFlight.add(instanceId);

  yield* Effect.gen(function* () {
    const accessToken = yield* readClaudeAccessToken({ configDir: input.configDir });
    if (accessToken === undefined) {
      // Not an error worth shouting about: an instance can legitimately have
      // no readable credential (a config dir signed in elsewhere, a locked
      // keychain). It shows no percentage, and shows it by showing nothing.
      return;
    }

    const outcome = yield* fetchClaudeUsage({ accessToken });
    switch (outcome._tag) {
      case "windows":
        yield* Effect.sync(() =>
          recordAccountUsage({
            instanceId,
            windows: outcome.windows,
            observedAt: DateTime.formatIso(DateTime.makeUnsafe(now)),
          }),
        );
        return;
      case "refused":
        // Loud on purpose. A 401 means the stored credential went stale and we
        // stopped knowing; failing quietly would leave a percentage on screen
        // that no longer describes anything.
        yield* Effect.logWarning(
          "claude usage request refused; stored credential is likely stale",
          {
            instanceId,
            status: outcome.status,
          },
        );
        return;
      case "unreachable":
        yield* Effect.logWarning("claude usage refresh could not complete", {
          instanceId,
          detail: outcome.detail,
        });
        return;
    }
  }).pipe(Effect.ensuring(Effect.sync(() => inFlight.delete(instanceId))));
});

/** Test seam. Never called in production paths. */
export const resetClaudeUsageRefreshState = (): void => {
  lastAttemptAt.clear();
  inFlight.clear();
};
