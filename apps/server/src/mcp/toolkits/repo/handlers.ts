import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

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
      };
    }),
} satisfies Parameters<typeof RepoToolkit.toLayer>[0];

export const RepoToolkitHandlersLive = RepoToolkit.toLayer(handlers);
