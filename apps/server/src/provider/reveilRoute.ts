import type { ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import {
  isLoopbackRemoteAddress,
  isSameAppBrowserRequest,
  readRemoteAddress,
} from "../tableauLocalProxy.ts";
import { reveiller, santeDe } from "./compteSanteStore.ts";

/**
 * REMETTRE UN COMPTE EN ROTATION — le geste humain qui manquait.
 *
 * `reveiller()` existait, était documenté « à appeler après une
 * ré-authentification réussie »… et n'était appelé NULLE PART (trouvé deux
 * fois le 02/08, par deux chemins indépendants). Or un compte « mort » est
 * exclu du choix, donc ne reçoit plus de tour, donc `noterSucces` ne peut
 * plus le guérir : il restait hors rotation jusqu'au redémarrage de l'app.
 *
 * Le déclencheur est un GESTE EXPLICITE, jamais une sonde. La reconnexion se
 * fait au terminal, hors de l'app — et `claude auth status` peut répondre
 * « connecté » avec un jeton que l'API refuse. Réveiller sur une sonde
 * ressusciterait les morts à chaque rafraîchissement, exactement la boucle
 * de retentatives que l'état « mort » existe pour arrêter. L'humain qui
 * vient de se reconnecter (ou de se réabonner — jeton valide, rien à
 * re-sonder) clique ; au pire, le premier échec réécarte le compte aussitôt.
 */

const Corps = Schema.Struct({ instanceId: Schema.String });
const decodeCorps = Schema.decodeUnknownEffect(Corps);

export const reveilRouteLayer = HttpRouter.add(
  "POST",
  "/api/comptes/reveiller",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (!isLoopbackRemoteAddress(readRemoteAddress(request.source))) {
      return HttpServerResponse.text("Local machine only.", { status: 403 });
    }
    if (!isSameAppBrowserRequest(request.headers)) {
      return HttpServerResponse.text("Cross-site requests are refused.", { status: 403 });
    }
    const corps = yield* Effect.orElseSucceed(decodeCorps(yield* request.json), () => null);
    if (corps === null || corps.instanceId.trim().length === 0) {
      return HttpServerResponse.jsonUnsafe(
        { reveille: false, raison: "corps invalide" },
        {
          status: 400,
        },
      );
    }

    const instanceId = corps.instanceId as ProviderInstanceId;
    const avant = santeDe(instanceId).etat;
    reveiller(instanceId);
    // `avant` dans la réponse : le client peut dire « était mort, revient »
    // plutôt qu'un vague succès — et un réveil d'un compte déjà sain se voit.
    return HttpServerResponse.jsonUnsafe({ reveille: true, etatAvant: avant });
  }),
);
