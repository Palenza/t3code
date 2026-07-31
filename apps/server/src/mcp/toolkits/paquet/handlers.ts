import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import {
  malveillantsSeulement,
  paquetALancer,
  verdictDePaquet,
  type AvisOsv,
  type PaquetVise,
} from "../../../securite/PaquetALancer.ts";
import { porteDeSortie } from "../../DebordementSurDisque.ts";
import { PaquetToolkit } from "./tools.ts";

/** L'API publique d'OSV, gratuite et maintenue par Google. */
const OSV = "https://api.osv.dev/v1/query";

/**
 * Leur délai est de 10 s. Le nôtre est de 5.
 *
 * La raison n'est pas le goût : chez eux le contrôle s'insère avant un
 * lancement de serveur MCP, une opération déjà lente que 10 s ne dénaturent
 * pas. Chez nous il est appelé DANS un tour d'agent, où chaque seconde
 * d'attente est une seconde où rien n'avance. 5 s laissent passer une réponse
 * OSV normale (~300 ms mesurés chez eux) avec une marge de plus de dix fois,
 * et coupent court quand le réseau est vraiment parti.
 */
const DELAI = Duration.seconds(5);

/** Ce qu'on lit de la réponse : le reste ne nous concerne pas. */
const ReponseOsv = Schema.Struct({
  vulns: Schema.optional(Schema.Unknown),
});

const interroger = (paquet: PaquetVise) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const corps = yield* HttpClientRequest.post(OSV).pipe(
      HttpClientRequest.setHeader("User-Agent", "t3-code-osv-check/1.0"),
      HttpClientRequest.bodyJsonUnsafe(
        paquet.version === null
          ? { package: { name: paquet.nom, ecosystem: paquet.ecosysteme } }
          : {
              package: { name: paquet.nom, ecosystem: paquet.ecosysteme },
              version: paquet.version,
            },
      ),
      client.execute,
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(ReponseOsv)),
      Effect.timeout(DELAI),
    );
    return malveillantsSeulement(corps.vulns);
  });

const handlers = {
  "paquet-malveillant": (input) =>
    Effect.flatMap(
      Effect.gen(function* () {
        const paquet = paquetALancer(input.commande, input.arguments);
        if (paquet === null) {
          // Ni un refus ni un feu vert : cette commande ne va rien chercher.
          // Le dire précisément évite qu'un « rien trouvé » sur `git status`
          // se lise comme une vérification réussie.
          return {
            malveillant: false,
            paquet: null,
            avis: [] as ReadonlyArray<AvisOsv>,
            verdict: `\`${input.commande}\` ne télécharge aucun paquet avant de s'exécuter — il n'y a rien à interroger. Ce contrôle ne couvre que npx, bunx, pnpm dlx, uvx et pipx : ce sont les commandes qui vont chercher du code et le lancent dans la foulée.`,
          };
        }

        const avis = yield* interroger(paquet).pipe(
          Effect.tapError((cause) =>
            Effect.logWarning("OSV injoignable — le contrôle de paquet n'a pas pu aboutir.", {
              paquet: paquet.nom,
              cause,
            }),
          ),
          Effect.orElseSucceed(() => null),
        );

        if (avis === null) {
          // Fail-open ASSUMÉ, et surtout : DIT. Un contrôle qui échoue en
          // silence rendrait `malveillant: false` — indiscernable d'un vrai
          // « rien trouvé ». C'est comme ça qu'on accorde un feu vert qu'on
          // n'a jamais donné.
          return {
            malveillant: false,
            paquet,
            avis: [] as ReadonlyArray<AvisOsv>,
            verdict: `OSV n'a pas répondu en ${String(Duration.toSeconds(DELAI))} s : on ne sait RIEN de ${paquet.nom} (${paquet.ecosysteme}). Ce n'est pas un feu vert — c'est une absence de réponse. Si le paquet est inconnu de toi aussi, réessaie ou vérifie son nom à la main avant de le lancer.`,
            note: "Le contrôle a échoué, il n'a pas conclu.",
          };
        }

        const verdict = verdictDePaquet(paquet, avis);
        return { malveillant: verdict.malveillant, paquet, avis, verdict: verdict.phrase };
      }),
      porteDeSortie,
    ),
} satisfies Parameters<typeof PaquetToolkit.toLayer>[0];

export const PaquetToolkitHandlersLive = PaquetToolkit.toLayer(handlers);
