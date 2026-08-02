import { describe, it, assert } from "@effect/vitest";
import type { ServerProvider } from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";

import { noterEchec, viderSantes } from "./compteSanteStore.ts";
import { makeProviderStatusStream } from "./providerStatusStream.ts";
import { recordRateLimitEvent, resetRateLimitStore } from "./rateLimitStore.ts";

/**
 * The point of these tests is the WIRING, not the pieces.
 *
 * Its predecessor lived inline in `ws.ts`, where a mutation check showed it
 * could be deleted with the typecheck at zero errors and every test green: the
 * client would simply never receive a quota, in silence. Each test below fails
 * if one strand of the chain is cut.
 */

const provider = (instanceId: string): ServerProvider =>
  ({
    instanceId,
    driver: "claudeAgent",
    displayName: "Claude",
    enabled: true,
    installed: true,
    version: "2.1.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-07-27T15:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
  }) as never;

const observe = (input: { readonly instanceId: string; readonly utilization: number }) =>
  recordRateLimitEvent({
    type: "account.rate-limits.updated",
    providerInstanceId: input.instanceId as never,
    createdAt: "2026-07-27T15:00:00.000Z",
    payload: {
      rateLimits: {
        rate_limit_info: {
          status: "allowed",
          rateLimitType: "five_hour",
          utilization: input.utilization,
        },
      },
    },
  });

/** Stands in for the module-level store subscription. */
const makeFakeSubscription = () => {
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit: () => {
      for (const listener of listeners) {
        listener();
      }
    },
    get subscriberCount() {
      return listeners.size;
    },
  };
};

/**
 * `it.live` throughout: the stream is debounced, and the test clock never
 * elapses a debounce on its own. Every wait below is a condition, never a
 * fixed delay, so nothing here is a race waiting for a slow machine.
 */
const waitUntil = (condition: () => boolean) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 500; attempt++) {
      if (condition()) {
        return;
      }
      yield* Effect.sleep(Duration.millis(2));
    }
    throw new Error("condition never became true");
  });

describe("makeProviderStatusStream", () => {
  it.live("pushes a snapshot when usage changes, without re-probing", () =>
    Effect.gen(function* () {
      resetRateLimitStore();
      const subscription = makeFakeSubscription();
      let probeCount = 0;

      const stream = makeProviderStatusStream({
        registryChanges: Stream.never,
        getProviders: Effect.sync(() => {
          probeCount += 1;
          return [provider("claude-default")];
        }),
        debounce: 0,
        subscribeRateLimits: subscription.subscribe,
      });

      const collected = yield* Stream.take(stream, 1).pipe(Stream.runCollect, Effect.forkChild);
      // The subscription is registered when the stream starts, not when it is
      // built; emitting before it exists would test nothing.
      yield* waitUntil(() => subscription.subscriberCount === 1);

      observe({ instanceId: "claude-default", utilization: 82 });
      subscription.emit();

      const [event] = Array.from(yield* Fiber.join(collected));

      assert.strictEqual(event?.type, "providerStatuses");
      assert.strictEqual(event?.payload.providers[0]?.rateLimits?.windows[0]?.utilization, 82);
      // Reading the registry's cached list is the whole point: a percentage
      // must never cost a CLI spawn.
      assert.strictEqual(probeCount, 1);
    }),
  );

  it.live("carries current usage on a registry-driven push too", () =>
    Effect.gen(function* () {
      // A probe snapshot knows nothing about quotas. If the join happened
      // anywhere but here, this event would go out with the field missing.
      resetRateLimitStore();
      observe({ instanceId: "claude-default", utilization: 41 });

      const subscription = makeFakeSubscription();
      const registryChanges = yield* PubSub.unbounded<ReadonlyArray<ServerProvider>>();
      const stream = makeProviderStatusStream({
        registryChanges: Stream.fromPubSub(registryChanges),
        getProviders: Effect.succeed([]),
        debounce: 0,
        subscribeRateLimits: subscription.subscribe,
      });

      const collected = yield* Stream.take(stream, 1).pipe(Stream.runCollect, Effect.forkChild);
      yield* waitUntil(() => subscription.subscriberCount === 1);

      yield* PubSub.publish(registryChanges, [provider("claude-default")]);

      const [event] = Array.from(yield* Fiber.join(collected));

      assert.strictEqual(event?.payload.providers[0]?.rateLimits?.windows[0]?.utilization, 41);
    }),
  );

  it.live("porte AUSSI la rotation — sinon la poussée EFFACE ce que la connexion a montré", () =>
    Effect.gen(function* () {
      // LE BUG DU 03/08, FIGÉ ICI.
      //
      // Le client applique ce payload par REMPLACEMENT (`providers:
      // event.payload.providers`), pas par fusion champ par champ. Une poussée
      // sans `rotation` efface donc la rotation de TOUS les comptes. Or
      // l'instantané de connexion posait les deux projections et celle-ci une
      // seule : l'état s'affichait à l'ouverture, puis disparaissait au premier
      // tic de quota — quelques secondes plus tard. La bande « ce qui a besoin
      // d'attention » et la protection de l'abonnement qui expire redevenaient
      // invisibles, sans un rouge.
      resetRateLimitStore();
      viderSantes();
      const subscription = makeFakeSubscription();

      const stream = makeProviderStatusStream({
        registryChanges: Stream.never,
        getProviders: Effect.succeed([provider("claude-mort")]),
        debounce: 0,
        subscribeRateLimits: subscription.subscribe,
      });

      const collected = yield* Stream.take(stream, 1).pipe(Stream.runCollect, Effect.forkChild);
      yield* waitUntil(() => subscription.subscriberCount === 1);

      // Le compte meurt AVANT la poussée : c'est exactement l'ordre réel — la
      // rotation change, puis un quota arrive et repousse tout l'état.
      noterEchec(
        "claude-mort" as never,
        { nature: "authentification-morte", reconnu: true },
        "jeton révoqué",
        Date.parse("2026-08-03T00:00:00.000Z"),
      );
      observe({ instanceId: "claude-mort", utilization: 12 });
      subscription.emit();

      const events = yield* Fiber.join(collected);
      const rotation = Array.from(events)[0]?.payload.providers[0]?.rotation;
      assert.strictEqual(rotation?.state, "dead", "la poussée a effacé l'état de rotation");
      assert.strictEqual(rotation?.reason, "jeton révoqué");
    }),
  );

  it.live("pousse aussi quand c'est la SANTÉ qui bouge, pas le quota", () =>
    Effect.gen(function* () {
      // Troisième horloge. Une mort ne change ni ce qu'un compte EST ni ce
      // qu'il a CONSOMMÉ : sans abonnement à la santé, rien n'était poussé et
      // l'écran gardait l'état d'avant jusqu'au prochain tic de quota — donc
      // par hasard, et parfois jamais.
      resetRateLimitStore();
      viderSantes();

      const stream = makeProviderStatusStream({
        registryChanges: Stream.never,
        getProviders: Effect.succeed([provider("claude-sante")]),
        debounce: 0,
        subscribeRateLimits: () => () => {},
      });

      const collected = yield* Stream.take(stream, 1).pipe(Stream.runCollect, Effect.forkChild);
      // Aucun tic de quota ici : SEULE la santé bouge.
      yield* Effect.sleep(Duration.millis(20));
      noterEchec(
        "claude-sante" as never,
        { nature: "authentification-morte", reconnu: true },
        "jeton révoqué",
        Date.parse("2026-08-03T00:00:00.000Z"),
      );

      const events = yield* Fiber.join(collected);
      assert.strictEqual(
        Array.from(events)[0]?.payload.providers[0]?.rotation?.state,
        "dead",
        "un changement de santé seul n'a rien poussé",
      );
    }),
  );

  it.live("releases its subscription when the client disconnects", () =>
    Effect.gen(function* () {
      // A leak here is silent and cumulative: every reconnect would add a
      // listener to a store that never forgets.
      resetRateLimitStore();
      const subscription = makeFakeSubscription();

      const stream = makeProviderStatusStream({
        registryChanges: Stream.never,
        getProviders: Effect.succeed([provider("claude-default")]),
        debounce: 0,
        subscribeRateLimits: subscription.subscribe,
      });

      const collected = yield* Stream.take(stream, 1).pipe(Stream.runCollect, Effect.forkChild);
      yield* waitUntil(() => subscription.subscriberCount === 1);

      observe({ instanceId: "claude-default", utilization: 5 });
      subscription.emit();
      yield* Fiber.join(collected);
      yield* waitUntil(() => subscription.subscriberCount === 0);

      assert.strictEqual(subscription.subscriberCount, 0);
    }),
  );
});
