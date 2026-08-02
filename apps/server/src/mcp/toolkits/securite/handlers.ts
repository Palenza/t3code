import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { surfaceDe, verdictALOuverture } from "../../../securite/CeQuiSExecuteALOuverture.ts";
import { RefusStore } from "../../../securite/RefusStore.ts";
import { suggererDesAutorisations } from "../../../securite/SuggestionsDAutorisation.ts";
import { porteDeSortie } from "../../DebordementSurDisque.ts";
import { SuggestionsError, SuggestionsToolkit } from "./tools.ts";

const handlers = {
  "autorisations-suggerees": (input) =>
    Effect.flatMap(
      Effect.gen(function* () {
        const store = yield* RefusStore;
        const refus = yield* store.refus();
        const bilan = suggererDesAutorisations(refus, new Set(input.dejaAutorise ?? []));

        return {
          suggestions: bilan.suggestions,
          ecartes: bilan.ecartes,
          resume: bilan.resume,
          // H4, et c'est la ligne qui empêche la mauvaise lecture : la
          // projection est élaguée, donc « aucun refus » peut vouloir dire
          // « aucun refus conservé ». Sans cette note, une fenêtre courte se
          // lirait comme une absence de friction.
          note: "Les refus sont lus dans la projection, qui est élaguée : ce compte porte sur la fenêtre conservée, pas sur toute l'histoire. Une suggestion n'autorise rien par elle-même.",
        };
      }).pipe(
        Effect.mapError(
          (cause) =>
            new SuggestionsError({
              message: `Lecture des refus impossible : ${String(cause)}`,
            }),
        ),
      ),
      porteDeSortie,
    ),
  "ce-qui-sexecute": (input) =>
    Effect.flatMap(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        // On ne descend QUE dans `.claude` et la racine : c'est là que vit
        // l'exécutable, et marcher tout l'arbre d'un dépôt inconnu coûterait
        // cher pour ne rien apprendre de plus.
        const sous = (dossier: string): Effect.Effect<ReadonlyArray<string>> =>
          Effect.gen(function* () {
            const entrees = yield* fileSystem
              .readDirectory(dossier)
              .pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>));
            const trouves: string[] = [];
            for (const entree of entrees) {
              const complet = path.join(dossier, entree);
              const info = yield* fileSystem.stat(complet).pipe(Effect.orElseSucceed(() => null));
              if (info === null) continue;
              if (info.type === "Directory") trouves.push(...(yield* sous(complet)));
              else trouves.push(path.relative(input.chemin, complet));
            }
            return trouves;
          });

        const racine = yield* fileSystem
          .readDirectory(input.chemin)
          .pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>));
        const fichiers = [
          ...racine,
          ...(yield* sous(path.join(input.chemin, ".claude"))).map((f) =>
            f.startsWith(".claude") ? f : path.join(".claude", f),
          ),
        ];

        const verdict = verdictALOuverture(surfaceDe(fichiers), input.ecritParNous ?? false);
        return {
          gravite: verdict.gravite,
          quoi: verdict.quoi,
          message: verdict.message,
          // H4 : ce qu'on n'a PAS regardé se dit. Sans ça, un « rien » se
          // lirait comme « ce dépôt est sûr », ce qu'on n'a pas prouvé.
          note: "Seuls `.claude/` et la racine sont inspectés. Un dépôt peut exécuter du code par d'autres chemins — scripts de paquet, Makefile, tâches d'éditeur. Un « rien » ici veut dire « rien PAR CE CHEMIN-LÀ ».",
        };
      }).pipe(
        Effect.mapError(
          (cause) =>
            new SuggestionsError({ message: `Lecture du dossier impossible : ${String(cause)}` }),
        ),
      ),
      porteDeSortie,
    ),
} satisfies Parameters<typeof SuggestionsToolkit.toLayer>[0];

export const SuggestionsToolkitHandlersLive = SuggestionsToolkit.toLayer(handlers);
