import * as Effect from "effect/Effect";

import { etatDesPreuves } from "../../../preuve/PreuveCommande.ts";
import { PreuveStore } from "../../../preuve/PreuveStore.ts";
import { PreuveError, PreuveToolkit } from "./tools.ts";

/**
 * Combien d'activités d'outil on remonte.
 *
 * Assez pour couvrir une longue session de chantier, pas assez pour
 * ressusciter un vert d'il y a trois jours sur du code qui a changé depuis.
 * Chiffre de départ, à recaler quand l'usage dira ce qu'une session couvre.
 */
const ACTIVITES_LUES = 400;

const handlers = {
  preuve: (input) =>
    Effect.gen(function* () {
      const store = yield* PreuveStore;
      const passages = yield* store.preuvesDuFil(input.filId, ACTIVITES_LUES).pipe(
        Effect.mapError(
          (cause) =>
            new PreuveError({
              message: `Le registre n'a pas pu lire le flux d'activité (${String(cause)}). Vérifie l'identifiant du fil.`,
            }),
        ),
      );

      const etat = etatDesPreuves(passages);
      const prouves = etat.filter((ligne) => ligne.prouve).map((ligne) => ligne.nature);

      return {
        etat,
        passages,
        // H4 : ce qu'on n'a pas vu est un fait sur NOUS, pas sur le monde. Le
        // registre ne lit que les commandes lancées DANS ce fil — un test
        // passé ailleurs existe, il n'est simplement pas ici.
        note:
          passages.length === 0
            ? `Aucune vérification trouvée dans ce fil (${ACTIVITES_LUES} dernières activités lues). Ça ne veut pas dire que rien n'a été vérifié — seulement que rien ne l'a été ICI.`
            : `${passages.length} passage(s) de vérification. Prouvé : ${prouves.length > 0 ? prouves.join(", ") : "rien de complet"}. Un passage CIBLÉ au vert ne dit rien du reste du dépôt.`,
      };
    }),
} satisfies Parameters<typeof PreuveToolkit.toLayer>[0];

export const PreuveToolkitHandlersLive = PreuveToolkit.toLayer(handlers);
