import * as Effect from "effect/Effect";

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
} satisfies Parameters<typeof SuggestionsToolkit.toLayer>[0];

export const SuggestionsToolkitHandlersLive = SuggestionsToolkit.toLayer(handlers);
