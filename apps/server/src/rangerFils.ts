import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import * as TextGeneration from "./textGeneration/TextGeneration.ts";
import {
  isLoopbackRemoteAddress,
  isSameAppBrowserRequest,
  readRemoteAddress,
} from "./tableauLocalProxy.ts";

/**
 * « Ranger » — le Tidy d'Arc appliqué aux fils (demande fondateur 29/07,
 * vidéo décortiquée : Arc regroupe les onglets ouverts sous des en-têtes
 * thématiques nommés, chacun acceptable ou rejetable d'un clic).
 *
 * Ici le client envoie les fils VISIBLES (id + titre, rien d'autre — aucun
 * contenu de conversation ne sort), un juge sémantique les regroupe, et le
 * client affiche la proposition. Accepter un groupe crée un Espace.
 *
 * Loopback + garde d'origine, comme les autres routes locales.
 *
 * ⚠️ PAS ENCORE MONTÉE dans `server.ts` : ce layer demande `TextGeneration`,
 * qui demande `ProviderInstanceRegistry` — la composition des routes n'a ni
 * l'un ni l'autre à sa portée. Le montage propre (remonter la route dans la
 * couche qui porte déjà le registry, comme `GitManagerLayerLive`) est le
 * premier geste de la reprise ; le service et le prompt, eux, sont finis et
 * compilent.
 */

const RangerRequest = Schema.Struct({
  cwd: Schema.String,
  instanceId: Schema.String,
  model: Schema.String,
  // `settled` : le fil est dormant. Il entre dans le rangement comme les
  // autres — c'est là que le désordre s'accumule — et il reste dormant : le
  // client ne change QUE son espace d'appartenance.
  threads: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      settled: Schema.optional(Schema.Boolean),
    }),
  ),
});

/** Au-delà, le prompt devient trop long pour rester net et rapide. */
const MAX_THREADS = 60;

/**
 * Compilé UNE fois, au chargement du module.
 *
 * `Schema.decodeUnknownEffect(...)` reconstruit son décodeur à chaque appel :
 * placé dans le corps de la route, il le refabriquait à chaque requête.
 */
const decoderLaDemande = Schema.decodeUnknownEffect(RangerRequest);

export const rangerFilsRouteLayer = HttpRouter.add(
  "POST",
  "/api/ranger-fils",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (!isLoopbackRemoteAddress(readRemoteAddress(request.source))) {
      return HttpServerResponse.text("Local machine only.", { status: 403 });
    }
    if (!isSameAppBrowserRequest(request.headers)) {
      return HttpServerResponse.text("Cross-site requests are refused.", { status: 403 });
    }

    const body = yield* request.json.pipe(Effect.orElseSucceed(() => null));
    const decoded = yield* decoderLaDemande(body).pipe(Effect.orElseSucceed(() => null));
    if (decoded === null || decoded.threads.length < 4) {
      // Moins de 4 fils : il n'y a rien à ranger, et le dire vaut mieux que
      // de rendre un groupe artificiel.
      return HttpServerResponse.jsonUnsafe({ groups: [], reason: "too-few-threads" });
    }

    const textGeneration = yield* TextGeneration.TextGeneration;
    const result = yield* textGeneration
      .groupThreadsByTheme({
        cwd: decoded.cwd,
        threads: decoded.threads.slice(0, MAX_THREADS),
        modelSelection: {
          instanceId: decoded.instanceId as never,
          model: decoded.model,
        },
      })
      .pipe(
        Effect.tapError((cause) => Effect.logWarning("ranger-fils failed", { cause })),
        Effect.orElseSucceed(() => null),
      );
    if (result === null) {
      // Fail-loud côté client : un échec se DIT, il ne se déguise pas en
      // « rien à ranger ».
      return HttpServerResponse.jsonUnsafe(
        { groups: [], reason: "generation-failed" },
        { status: 502 },
      );
    }
    return HttpServerResponse.jsonUnsafe(
      { groups: result.groups, reason: null },
      { headers: { "cache-control": "no-store" } },
    );
  }),
);
