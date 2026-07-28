import { assert, describe, it } from "@effect/vitest";
import type { ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { ChildProcessSpawner } from "effect/unstable/process";

import { refreshClaudeUsage, resetClaudeUsageRefreshState } from "./claudeUsageRefresh.ts";
import { getRateLimits, recordRateLimitEvent, resetRateLimitStore } from "./rateLimitStore.ts";

/**
 * These tests exist for the WIRING, which is the part that keeps dying in
 * silence. Twice in this feature a correct-looking chain shipped with one link
 * missing and rendered exactly like "the provider never reported": once when
 * the join was deletable with every test green, once when a required field the
 * provider never sends made the parser drop every event.
 *
 * Each test below fails if one link of event → credential → request → store is
 * cut.
 *
 * `configDir` is always set, which keeps the keychain path — and any real
 * `security` process — out of the tests entirely.
 */

const instance = (id: string) => id as ProviderInstanceId;

const CONFIG_DIR = "/tmp/t3code-test-config";

/** Year 2100 and 1970: valid and expired, without reading a clock. */
const VALID_UNTIL = 4_102_444_800_000;
const EXPIRED_AT = 1_000;

const credentialJson = (expiresAt: number) =>
  JSON.stringify({
    claudeAiOauth: {
      accessToken: "test-token",
      refreshToken: "test-refresh",
      expiresAt,
    },
  });

const USAGE_BODY = {
  five_hour: { utilization: 9, resets_at: "2026-07-28T04:10:00.864821+00:00" },
  seven_day: { utilization: 13, resets_at: "2026-07-28T12:59:59.864850+00:00" },
};

const layers = (input: {
  readonly credential?: string | undefined;
  readonly respond: (
    request: Parameters<Parameters<typeof HttpClient.make>[0]>[0],
  ) => Effect.Effect<HttpClientResponse.HttpClientResponse, never>;
}) =>
  Layer.mergeAll(
    Layer.succeed(
      FileSystem.FileSystem,
      FileSystem.makeNoop({
        // Only the credential file is ever read here; every test sets
        // `configDir`, so no other path reaches this stub.
        readFileString: () => Effect.succeed(input.credential ?? ""),
      }),
    ),
    Layer.succeed(HttpClient.HttpClient, HttpClient.make(input.respond)),
    Path.layer,
    // Never reached: every test sets `configDir`, so the keychain branch is
    // not taken. Present only to satisfy the requirement.
    Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, {} as never),
  );

const okResponse = (body: unknown) => (request: never) =>
  Effect.succeed(
    HttpClientResponse.fromWeb(
      request,
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );

const statusResponse = (status: number) => (request: never) =>
  Effect.succeed(HttpClientResponse.fromWeb(request, new Response("{}", { status })));

const run = <A>(
  effect: Effect.Effect<
    A,
    never,
    | FileSystem.FileSystem
    | HttpClient.HttpClient
    | Path.Path
    | ChildProcessSpawner.ChildProcessSpawner
  >,
  provided: Layer.Layer<
    | FileSystem.FileSystem
    | HttpClient.HttpClient
    | Path.Path
    | ChildProcessSpawner.ChildProcessSpawner
  >,
) => effect.pipe(Effect.provide(provided));

describe("refreshClaudeUsage", () => {
  it.effect("puts a real percentage in the store", () =>
    Effect.gen(function* () {
      resetRateLimitStore();
      resetClaudeUsageRefreshState();

      yield* run(
        refreshClaudeUsage({ instanceId: instance("claude-default"), configDir: CONFIG_DIR }),
        layers({
          credential: credentialJson(VALID_UNTIL),
          respond: okResponse(USAGE_BODY) as never,
        }),
      );

      const stored = getRateLimits(instance("claude-default"));
      assert.strictEqual(stored?.windows[0]?.utilization, 9);
      assert.strictEqual(stored?.windows[1]?.utilization, 13);
    }),
  );

  it.effect("completes the runtime event instead of overwriting it", () =>
    Effect.gen(function* () {
      // The two sources describe the same window and each holds what the other
      // lacks: the event knows the state, the API knows the figure. Whichever
      // lands second must not erase the first.
      resetRateLimitStore();
      resetClaudeUsageRefreshState();

      recordRateLimitEvent({
        type: "account.rate-limits.updated",
        providerInstanceId: instance("claude-default"),
        createdAt: "2026-07-27T23:59:00.000Z",
        payload: {
          rateLimits: {
            rate_limit_info: {
              status: "allowed_warning",
              rateLimitType: "five_hour",
              resetsAt: 1_785_211_800,
            },
          },
        },
      });

      yield* run(
        refreshClaudeUsage({ instanceId: instance("claude-default"), configDir: CONFIG_DIR }),
        layers({
          credential: credentialJson(VALID_UNTIL),
          respond: okResponse(USAGE_BODY) as never,
        }),
      );

      const window = getRateLimits(instance("claude-default"))?.windows[0];
      assert.strictEqual(window?.utilization, 9);
      assert.strictEqual(window?.severity, "allowed_warning");
      assert.strictEqual(window?.resetsAtEpoch, 1_785_211_800);
    }),
  );

  it.effect("asks once, not once per event in a burst", () =>
    Effect.gen(function* () {
      // A turn emits several rate-limit events. One request each, for a figure
      // that moves by fractions of a percent, is waste — and on a slow link, a
      // pile-up.
      resetRateLimitStore();
      resetClaudeUsageRefreshState();
      let calls = 0;

      const provided = layers({
        credential: credentialJson(VALID_UNTIL),
        respond: ((request: never) => {
          calls += 1;
          return okResponse(USAGE_BODY)(request);
        }) as never,
      });

      yield* run(
        refreshClaudeUsage({ instanceId: instance("claude-default"), configDir: CONFIG_DIR }),
        provided,
      );
      yield* run(
        refreshClaudeUsage({ instanceId: instance("claude-default"), configDir: CONFIG_DIR }),
        provided,
      );

      assert.strictEqual(calls, 1);
    }),
  );

  it.effect("never throttles one account behind another", () =>
    Effect.gen(function* () {
      // Two Claude instances are two subscriptions. A shared throttle would
      // leave the second account blank because the first just asked.
      resetRateLimitStore();
      resetClaudeUsageRefreshState();
      let calls = 0;

      const provided = layers({
        credential: credentialJson(VALID_UNTIL),
        respond: ((request: never) => {
          calls += 1;
          return okResponse(USAGE_BODY)(request);
        }) as never,
      });

      yield* run(
        refreshClaudeUsage({ instanceId: instance("claude-perso"), configDir: CONFIG_DIR }),
        provided,
      );
      yield* run(
        refreshClaudeUsage({ instanceId: instance("claude-pro"), configDir: CONFIG_DIR }),
        provided,
      );

      assert.strictEqual(calls, 2);
    }),
  );

  it.effect("stores nothing when the credential has expired", () =>
    Effect.gen(function* () {
      // An expired token would earn a 401. Spending the request to find out is
      // pointless, and showing a percentage from before it expired is worse.
      resetRateLimitStore();
      resetClaudeUsageRefreshState();
      let calls = 0;

      yield* run(
        refreshClaudeUsage({ instanceId: instance("claude-default"), configDir: CONFIG_DIR }),
        layers({
          credential: credentialJson(EXPIRED_AT),
          respond: ((request: never) => {
            calls += 1;
            return okResponse(USAGE_BODY)(request);
          }) as never,
        }),
      );

      assert.strictEqual(calls, 0);
      assert.strictEqual(getRateLimits(instance("claude-default")), undefined);
    }),
  );

  it.effect("keeps the previous figure when the credential is refused", () =>
    Effect.gen(function* () {
      // A 401 means we stopped knowing. It must not blank the account, and it
      // must not pretend either — the reading keeps its original date, which
      // is what tells the reader it is ageing.
      resetRateLimitStore();
      resetClaudeUsageRefreshState();

      yield* run(
        refreshClaudeUsage({ instanceId: instance("claude-default"), configDir: CONFIG_DIR }),
        layers({
          credential: credentialJson(VALID_UNTIL),
          respond: okResponse(USAGE_BODY) as never,
        }),
      );
      resetClaudeUsageRefreshState();

      yield* run(
        refreshClaudeUsage({ instanceId: instance("claude-default"), configDir: CONFIG_DIR }),
        layers({ credential: credentialJson(VALID_UNTIL), respond: statusResponse(401) as never }),
      );

      assert.strictEqual(getRateLimits(instance("claude-default"))?.windows[0]?.utilization, 9);
    }),
  );
});
