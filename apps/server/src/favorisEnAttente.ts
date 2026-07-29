// @effect-diagnostics nodeBuiltinImport:off - Une file sur disque, lue et vidée en place.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import {
  isLoopbackRemoteAddress,
  isSameAppBrowserRequest,
  readRemoteAddress,
} from "./tableauLocalProxy.ts";

/**
 * Épingler un lien SANS passer par le clavier (demande fondateur 29/07 : « la
 * revue Raptor, ça devrait être mis directement dans les favoris design »).
 *
 * Quand quelque chose produit un livrable consultable — une page publiée, un
 * rapport, un banc de design — ce livrable doit atterrir tout seul dans les
 * favoris de l'espace où on travaille. Aujourd'hui il faut copier l'adresse et
 * la recoller dans « Épingler une adresse » : le geste est petit, mais il se
 * répète à chaque livrable, et un lien qu'on ne colle pas est un lien perdu.
 *
 * Le canal est un FICHIER, pas un flux : `~/.t3/favoris-en-attente.jsonl`.
 * C'est le choix qui rend la chose utilisable par tout ce qui tourne sur cette
 * machine — l'agent via un outil, un script de nuit, une commande tapée à la
 * main — sans qu'aucun d'eux ait à parler le protocole du client. L'écrit
 * survit à un redémarrage ; un événement poussé dans le vide, non.
 *
 * Loopback-only comme le proxy du tableau local : ça ne décrit et ne touche
 * que la machine sur laquelle le serveur tourne.
 */

/**
 * Surchargeable pour que les tests n'écrivent JAMAIS dans le vrai `~/.t3` —
 * la première version de ce fichier a effacé une file réelle en tournant.
 */
const FILE_ATTENTE =
  process.env["T3_FAVORIS_EN_ATTENTE"] ??
  NodePath.join(NodeOS.homedir(), ".t3/favoris-en-attente.jsonl");

/** Un favori en attente d'être épinglé par le client. */
export const FavoriEnAttente = Schema.Struct({
  url: Schema.String,
  titre: Schema.optional(Schema.String),
  /** L'espace visé par son NOM ; absent = l'espace actif au moment de la prise. */
  espace: Schema.optional(Schema.String),
});
export type FavoriEnAttente = typeof FavoriEnAttente.Type;

const decodeLigne = Schema.decodeUnknownSync(Schema.fromJsonString(FavoriEnAttente));
/** Hissé : la fonction compilée serait reconstruite à chaque requête. */
const decodeCorps = Schema.decodeUnknownEffect(FavoriEnAttente);
const encodeLigne = Schema.encodeSync(Schema.fromJsonString(FavoriEnAttente));

/** Ajoute un favori à la file. Append-only : deux écrivains ne s'écrasent pas. */
export function empilerFavori(favori: FavoriEnAttente): void {
  NodeFS.mkdirSync(NodePath.dirname(FILE_ATTENTE), { recursive: true });
  NodeFS.appendFileSync(FILE_ATTENTE, `${encodeLigne(favori)}\n`, "utf8");
}

/**
 * Lit la file ET la vide, en un seul geste. Le `rm` avant le parse est
 * volontaire : une ligne illisible ne doit pas rester coincée à faire échouer
 * chaque relève suivante — on la jette avec le reste et on continue.
 */
export function releverFavoris(): ReadonlyArray<FavoriEnAttente> {
  let brut: string;
  try {
    brut = NodeFS.readFileSync(FILE_ATTENTE, "utf8");
  } catch {
    return [];
  }
  try {
    NodeFS.rmSync(FILE_ATTENTE);
  } catch {
    // Rien à faire : au pire on re-livrera, et le client dédoublonne par URL.
  }
  const favoris: FavoriEnAttente[] = [];
  for (const ligne of brut.split("\n")) {
    const texte = ligne.trim();
    if (texte.length === 0) continue;
    try {
      favoris.push(decodeLigne(texte));
    } catch {
      // Ligne abîmée : on la saute sans bloquer les voisines.
    }
  }
  return favoris;
}

const gardeLocale = (request: HttpServerRequest.HttpServerRequest) => {
  if (!isLoopbackRemoteAddress(readRemoteAddress(request.source))) {
    return HttpServerResponse.text("Local machine only.", { status: 403 });
  }
  if (!isSameAppBrowserRequest(request.headers)) {
    return HttpServerResponse.text("Cross-site requests are refused.", { status: 403 });
  }
  return null;
};

/** Le client relève ce qui l'attend — et la file se vide du même coup. */
export const favorisEnAttenteRouteLayer = HttpRouter.add(
  "GET",
  "/api/favoris/en-attente",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const refus = gardeLocale(request);
    if (refus !== null) return refus;
    return HttpServerResponse.jsonUnsafe(
      { favoris: releverFavoris() },
      { headers: { "cache-control": "no-store" } },
    );
  }),
);

/** Déposer un lien à épingler. Appelable par l'agent, un script, une commande. */
export const favorisEpinglerRouteLayer = HttpRouter.add(
  "POST",
  "/api/favoris/epingler",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const refus = gardeLocale(request);
    if (refus !== null) return refus;
    const corps = yield* Effect.orElseSucceed(
      decodeCorps(yield* request.json),
      () => null,
    );
    if (corps === null) {
      return HttpServerResponse.jsonUnsafe(
        { epingle: false, raison: "Il faut au minimum une url." },
        { status: 400 },
      );
    }
    yield* Effect.sync(() => {
      empilerFavori(corps);
    });
    return HttpServerResponse.jsonUnsafe({ epingle: true });
  }),
);
