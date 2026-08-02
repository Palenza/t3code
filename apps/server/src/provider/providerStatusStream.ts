import type { ServerProvider } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import { withCurrentRateLimits } from "./rateLimitProjection.ts";
import { subscribeRateLimitChanges } from "./rateLimitStore.ts";
import { withRotationState } from "./rotationProjection.ts";
import { surChangementDeSante } from "./compteSanteStore.ts";

export interface ProviderStatusesEvent {
  readonly version: 1;
  readonly type: "providerStatuses";
  readonly payload: { readonly providers: ReadonlyArray<ServerProvider> };
}

/**
 * The `providerStatuses` half of the server-config stream.
 *
 * Lives outside `ws.ts` for two reasons. The wiring is worth a test — the
 * previous version of this join sat inline in a 2 000-line file where deleting
 * it left every test green and the client simply never received a quota. And
 * `ws.ts` is a file the upstream edits constantly: the smaller our footprint
 * in it, the cheaper every merge.
 *
 * Two clocks feed one event:
 *
 *  - `registryChanges` fires when a probe changes what a provider IS —
 *    installed, authenticated, which models. Every five minutes, or on demand.
 *  - `rateLimitChanges` fires when a turn reports what an account has USED.
 *    Mid-turn, unpredictably, and far more often.
 *
 * They are merged before the mapping so a client receives one shape and never
 * has to know which clock moved. A usage tick re-reads the registry's current
 * list rather than re-probing: a percentage must never cost a CLI spawn.
 */
export const makeProviderStatusStream = (input: {
  readonly registryChanges: Stream.Stream<ReadonlyArray<ServerProvider>>;
  readonly getProviders: Effect.Effect<ReadonlyArray<ServerProvider>>;
  readonly debounce: Duration.Input;
  /** Overridden in tests; production always uses the module-level store. */
  readonly subscribeRateLimits?: (listener: () => void) => () => void;
}): Stream.Stream<ProviderStatusesEvent> => {
  const subscribe = input.subscribeRateLimits ?? subscribeRateLimitChanges;

  // A bare tick, carrying nothing: the subscriber re-reads the store when it
  // maps, so a burst can never deliver readings out of the order they were
  // written in.
  const rateLimitTicks = Stream.callback<void>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() =>
        subscribe(() => {
          Queue.offerUnsafe(queue, undefined);
        }),
      ),
      (unsubscribe) => Effect.sync(unsubscribe),
    ).pipe(Effect.asVoid),
  );

  // TROISIÈME HORLOGE : la SANTÉ d'un compte. Une mort, un refroidissement, une
  // reprise ne changent ni ce qu'un compte EST (registre) ni ce qu'il a CONSOMMÉ
  // (quota) — donc aucun des deux flux ci-dessus ne bouge. Sans cet abonnement,
  // un compte pouvait mourir sans que rien ne soit poussé : l'écran gardait
  // l'état d'avant jusqu'au prochain tic de quota, et la bande d'attention
  // n'apparaissait qu'à retardement, par hasard.
  const santeTicks = Stream.callback<void>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() =>
        surChangementDeSante(() => {
          Queue.offerUnsafe(queue, undefined);
        }),
      ),
      (unsubscribe) => Effect.sync(unsubscribe),
    ).pipe(Effect.asVoid),
  );

  return Stream.merge(
    input.registryChanges,
    Stream.merge(rateLimitTicks, santeTicks).pipe(Stream.mapEffect(() => input.getProviders)),
  ).pipe(
    Stream.mapEffect((providers) =>
      Effect.gen(function* () {
        // ⚠️ LA ROTATION AUSSI, ET C'EST LE BUG DU 03/08.
        //
        // Le client applique ce payload par REMPLACEMENT — `providers:
        // event.payload.providers` dans `state/server.ts`, pas une fusion champ
        // par champ. Une poussée sans `rotation` EFFACE donc la rotation de
        // tous les comptes.
        //
        // L'instantané de connexion (`ws.ts`) posait bien les deux projections ;
        // celle-ci n'en posait qu'une. Résultat mesuré : l'état de rotation
        // s'affichait à l'ouverture, puis disparaissait au PREMIER tic de quota
        // — c'est-à-dire au bout de quelques secondes d'usage. La ligne sous
        // chaque compte, la bande « ce qui a besoin d'attention », et la
        // protection de l'abonnement qui expire : tout redevenait invisible,
        // sans un rouge.
        //
        // Les deux projections voyagent ensemble désormais, et un test le fige.
        const maintenant = DateTime.toEpochMillis(yield* DateTime.now);
        const evenement: ProviderStatusesEvent = {
          version: 1,
          type: "providerStatuses",
          // Joined here rather than in the drivers: probe snapshots are cached on
          // disk, and a quota baked into one comes back stale at boot. See
          // `rateLimitProjection.ts`.
          payload: { providers: withRotationState(withCurrentRateLimits(providers), maintenant) },
        };
        return evenement;
      }),
    ),
    // Coalesces a burst — several instances reporting at once, or a probe and
    // a usage tick landing together — into one push.
    Stream.debounce(input.debounce),
  );
};
