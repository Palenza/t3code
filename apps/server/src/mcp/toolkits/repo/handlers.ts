import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { porteDeSortie } from "../../DebordementSurDisque.ts";
import { construireCarteDepuisExtraits, rendreCarte } from "./repoMapCore.ts";
import { balayerWorkspace } from "./repoMapWorkspace.ts";
import { RepoMapError, RepoToolkit } from "./tools.ts";

/**
 * Budget par défaut : ~3 000 jetons. Choix de départ ISOLÉ ici, pas une
 * mesure — à recaler quand l'usage réel dira ce qu'une carte utile coûte.
 */
const BUDGET_DEFAUT_CHARS = 12_000;

const handlers = {
  repo_map: (input) =>
    // La porte est à la SORTIE : tout ce que l'outil rend y passe, y compris
    // les chemins d'erreur. Ce toolkit l'esquivait depuis le 31/07 alors que
    // la porte se déclarait obligatoire — une carte de dépôt peut contenir un
    // secret aussi bien qu'un autre texte.
    Effect.flatMap(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const fs = yield* FileSystem.FileSystem;

        // Les erreurs sont lues par un AGENT (A7) : chaque refus nomme ce qui a
        // été demandé et ce qu'il fallait — jamais un échec nu.
        if (!path.isAbsolute(input.cwd)) {
          return yield* new RepoMapError({
            message: `cwd doit être ABSOLU — reçu « ${input.cwd} ». Donne la racine du dépôt (ex. /Users/toi/mon-depot).`,
          });
        }
        const existe = yield* fs.exists(input.cwd).pipe(Effect.orElseSucceed(() => false));
        if (!existe) {
          return yield* new RepoMapError({
            message: `cwd introuvable sur ce disque : « ${input.cwd} ».`,
          });
        }

        const balayage = yield* balayerWorkspace(input.cwd);
        const carte = construireCarteDepuisExtraits(balayage.extraits, input.focus ?? []);
        const rendu = rendreCarte(carte, input.maxChars ?? BUDGET_DEFAUT_CHARS);
        return {
          carte: rendu,
          fichiersClasses: carte.length,
          lus: balayage.lus,
          caches: balayage.caches,
          ignoresTropGros: balayage.ignoresTropGros,
          // H4 : une carte est un fait sur ce QU'ON A LU, pas sur le dépôt.
          // Sans cette phrase, « ce fichier n'est pas dans la carte » se lit
          // comme « ce fichier n'existe pas ».
          note: `Carte bornée à ${input.maxChars ?? BUDGET_DEFAUT_CHARS} caractères. ${balayage.lus} fichier(s) lu(s), ${balayage.caches} écarté(s) par les règles du dépôt, ${balayage.ignoresTropGros} écarté(s) car trop gros. Un fichier absent de la carte n'est pas un fichier absent du dépôt.`,
        };
      }),
      porteDeSortie,
    ),
} satisfies Parameters<typeof RepoToolkit.toLayer>[0];

export const RepoToolkitHandlersLive = RepoToolkit.toLayer(handlers);
