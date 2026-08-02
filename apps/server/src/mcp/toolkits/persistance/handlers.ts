import * as Effect from "effect/Effect";

import { detteDePersistance } from "../../../persistance/DetteDePersistance.ts";
import { DetteStore } from "../../../persistance/DetteStore.ts";
import { porteDeSortie } from "../../DebordementSurDisque.ts";
import { DetteError, DetteToolkit } from "./tools.ts";

/**
 * Combien de tours on remonte.
 *
 * Trois fois le seuil (12) : assez pour voir la série entière et la chiffrer
 * honnêtement, pas assez pour rapatrier un fil de trois semaines.
 */
const TOURS_LUS = 40;

const handlers = {
  dette: (input) =>
    // La porte est à la SORTIE : tout ce que l'outil rend y passe.
    Effect.flatMap(
      Effect.gen(function* () {
        const store = yield* DetteStore;
        const tours = yield* store.toursRecents(input.filId, TOURS_LUS).pipe(
          Effect.mapError(
            (cause) =>
              new DetteError({
                message: `Le flux d'activité n'a pas pu être lu (${String(cause)}). Vérifie l'identifiant du fil.`,
              }),
          ),
        );
        return {
          ...detteDePersistance(tours),
          // H4 : ce qu'on n'a pas vu est un fait sur NOUS. Une écriture faite
          // par une commande shell ne compte pas — on ne sait pas dire si un
          // `Bash` a produit un fichier ou n'a rien lu du tout. La dette peut
          // donc être SURESTIMÉE ; elle n'est jamais sous-estimée, et c'est le
          // bon sens de l'erreur.
          note: `Seules les écritures par outil dédié (Write, Edit, MultiEdit, NotebookEdit) sont comptées, sur les ${TOURS_LUS} derniers tours de CE fil. Un fichier écrit par une commande shell n'y laisse aucune trace : la dette annoncée peut être trop haute, jamais trop basse.`,
        };
      }),
      porteDeSortie,
    ),
} satisfies Parameters<typeof DetteToolkit.toLayer>[0];

export const DetteToolkitHandlersLive = DetteToolkit.toLayer(handlers);
