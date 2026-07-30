import * as Effect from "effect/Effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { lireCarnet, SEUIL_ARRET_DE_CHAINE } from "./provider/carnetInconnus.ts";
import {
  isLoopbackRemoteAddress,
  isSameAppBrowserRequest,
  readRemoteAddress,
} from "./tableauLocalProxy.ts";

/**
 * Le carnet des inconnus, rendu lisible à l'écran.
 *
 * Sans cette route, le carnet compterait dans le vide : un fichier JSON dans un
 * dossier d'état que personne n'ouvre vaut à peine mieux que le `logWarning`
 * qu'il remplace. Ce qui rend une observation utile, c'est qu'elle ARRIVE sous
 * les yeux — le comptage n'est que la moitié du travail.
 *
 * Mêmes gardes que les autres routes locales : machine locale uniquement, et
 * requête venue de l'app elle-même. Le carnet contient des messages d'erreur
 * bruts du fournisseur, qui peuvent porter des détails de compte.
 */
export const carnetRouteLayer = HttpRouter.add(
  "GET",
  "/api/carnet",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (!isLoopbackRemoteAddress(readRemoteAddress(request.source))) {
      return HttpServerResponse.text("Local machine only.", { status: 403 });
    }
    if (!isSameAppBrowserRequest(request.headers)) {
      return HttpServerResponse.text("Cross-site requests are refused.", { status: 403 });
    }
    const carnet = yield* lireCarnet();
    return HttpServerResponse.jsonUnsafe({
      seuil: SEUIL_ARRET_DE_CHAINE,
      entrees: carnet,
    });
  }).pipe(
    Effect.catchCause((cause) =>
      // Le carnet est un observatoire : s'il tombe, il le dit et rend un
      // carnet vide plutôt que de teindre l'interface en rouge.
      Effect.logWarning("carnet: lecture impossible", { cause }).pipe(
        Effect.as(
          HttpServerResponse.jsonUnsafe(
            { seuil: SEUIL_ARRET_DE_CHAINE, entrees: [] },
            { status: 500 },
          ),
        ),
      ),
    ),
  ),
);
