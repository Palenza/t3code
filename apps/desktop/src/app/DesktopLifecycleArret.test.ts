import { assert, describe, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";

import * as DesktopLifecycle from "./DesktopLifecycle.ts";
import * as DesktopShutdown from "./DesktopShutdown.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";

/**
 * L'ARRÊT NE PEUT PLUS SE BLOQUER POUR TOUJOURS.
 *
 * `awaitComplete` était un `Deferred.await` nu, libéré seulement quand TOUS
 * les moteurs du pool se sont arrêtés. Un moteur coincé avant son propre
 * `forceKillAfter` — sonde sans réponse, drain qui ne finit pas — et Cmd+Q
 * ne rendait plus jamais la main.
 *
 * On ne teste pas le chemin `before-quit` complet : il s'échappe d'Effect par
 * une Promesse (`.finally`), que l'horloge simulée ne pilote pas. On teste la
 * fonction qui PORTE la borne, avec un arrêt qui ne se termine jamais.
 */

/** Une fenêtre qui ne sait que vider ses bornes — c'est tout ce qu'on appelle ici. */
const fenetreMuette = Layer.succeed(DesktopWindow.DesktopWindow, {
  flushMainWindowBounds: Effect.void,
} as unknown as DesktopWindow.DesktopWindow["Service"]);

const scene = Layer.mergeAll(TestClock.layer(), DesktopShutdown.layer, fenetreMuette);

describe("arrêt borné", () => {
  it.effect("rend la main quand rien ne complète jamais l'arrêt", () =>
    Effect.gen(function* () {
      const fibre = yield* DesktopLifecycle.requestDesktopShutdownAndWait().pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      // Juste avant la limite : on attend toujours. C'est ce qui prouve que
      // la borne est bien une borne, et pas un abandon immédiat déguisé.
      yield* TestClock.adjust(Duration.seconds(14));
      assert.isUndefined(fibre.pollUnsafe(), "l'arrêt a lâché AVANT sa limite");

      // Passé la limite, on part quand même. Un arrêt bruyant vaut mieux
      // qu'une application qu'on ne peut plus fermer.
      yield* TestClock.adjust(Duration.seconds(2));
      yield* Fiber.join(fibre);
    }).pipe(Effect.scoped, Effect.provide(scene)),
  );

  it.effect("rend la main IMMÉDIATEMENT quand l'arrêt se termine normalement", () =>
    Effect.gen(function* () {
      const shutdown = yield* DesktopShutdown.DesktopShutdown;
      const fibre = yield* DesktopLifecycle.requestDesktopShutdownAndWait().pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      // Le cas SAIN ne doit jamais sentir que la limite existe : aucune
      // horloge avancée, aucune attente.
      yield* shutdown.markComplete;
      yield* Fiber.join(fibre);
    }).pipe(Effect.scoped, Effect.provide(scene)),
  );

  it.effect("demande bien l'arrêt avant de l'attendre", () =>
    Effect.gen(function* () {
      const shutdown = yield* DesktopShutdown.DesktopShutdown;
      const fibre = yield* DesktopLifecycle.requestDesktopShutdownAndWait().pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      // Sans la demande, le finalizer qui arrête les moteurs ne démarrerait
      // même pas — on attendrait la fin de quelque chose qui n'a pas commencé.
      yield* shutdown.awaitRequest;

      yield* shutdown.markComplete;
      yield* Fiber.join(fibre);
    }).pipe(Effect.scoped, Effect.provide(scene)),
  );

  it("la limite reste au-dessus de la plus longue étape bornée de l'arrêt", () => {
    // `DEFAULT_BACKEND_OUTPUT_DRAIN_TIMEOUT` vaut 5 s dans
    // `DesktopBackendManager`. Le fil-piège doit rester LARGEMENT au-dessus,
    // sinon il mordrait des arrêts sains — et c'est la limite qui aurait
    // tort, pas eux.
    assert.isAtLeast(Duration.toMillis(DesktopLifecycle.ARRET_LIMITE), 15_000);
  });
});
