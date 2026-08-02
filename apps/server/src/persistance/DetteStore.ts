/**
 * DETTE DE PERSISTANCE — l'accès aux données, et rien d'autre.
 *
 * On relit le flux d'activité que T3 enregistre déjà : aucune instrumentation,
 * aucune écriture, aucun schéma nouveau. Même patron que `PreuveStore` et
 * `UsageStore`.
 *
 * Toute la DÉCISION vit dans `DetteDePersistance.ts`, pur et testé sans base.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { toPersistenceSqlError } from "../persistence/Errors.ts";
import type { PersistenceSqlError } from "../persistence/Errors.ts";
import type { TourObserve } from "./DetteDePersistance.ts";

/**
 * Les outils qui laissent une TRACE DURABLE.
 *
 * `Bash` n'y est pas, volontairement : une commande shell peut écrire un
 * fichier comme elle peut n'en lire aucun, et on ne saurait pas dire lequel.
 * Compter `Bash` comme une écriture rendrait la dette invisible — or c'est
 * exactement pendant les longues séries de `Bash` que la panne arrive.
 * Mieux vaut une alerte de trop qu'un compteur qui ne monte jamais.
 */
const ECRIVAINS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

export interface DetteStoreShape {
  /**
   * Les tours d'un fil, du plus RÉCENT au plus ancien.
   *
   * `combien` borne la lecture : au-delà on remonterait à un travail dont la
   * trace a été gravée depuis longtemps.
   */
  readonly toursRecents: (
    filId: string,
    combien: number,
  ) => Effect.Effect<ReadonlyArray<TourObserve>, PersistenceSqlError>;
}

export class DetteStore extends Context.Service<DetteStore, DetteStoreShape>()(
  "t3/persistance/DetteStore",
) {}

/** Le nom d'outil d'une activité, ou `null` si la charge est illisible. */
export function nomDOutil(payload: string): string | null {
  let objet: unknown;
  try {
    objet = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof objet !== "object" || objet === null) return null;
  const data = (objet as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const nom = (data as { toolName?: unknown }).toolName;
  return typeof nom === "string" && nom.length > 0 ? nom : null;
}

interface LigneActivite {
  readonly turn_id: string | null;
  readonly payload_json: string;
}

const makeDetteStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const toursRecents: DetteStoreShape["toursRecents"] = (filId, combien) =>
    Effect.gen(function* () {
      // On lit les activités du fil, du plus récent au plus ancien, puis on
      // regroupe par tour EN CONSERVANT cet ordre. Grouper côté SQL coûterait
      // un `json_extract` par ligne pour un résultat qu'on doit de toute façon
      // reparcourir.
      const lignes = yield* sql<LigneActivite>`
        SELECT turn_id, payload_json
        FROM projection_thread_activities
        WHERE thread_id = ${filId}
          AND kind = 'tool.completed'
          AND turn_id IS NOT NULL
        ORDER BY created_at DESC, sequence DESC
      `;

      const tours: TourObserve[] = [];
      const parTour = new Map<string, number>();
      for (const ligne of lignes) {
        const tourId = ligne.turn_id;
        if (tourId === null) continue;
        let position = parTour.get(tourId);
        if (position === undefined) {
          if (tours.length >= Math.max(1, combien)) break;
          position = tours.length;
          parTour.set(tourId, position);
          tours.push({ outils: 0, ecritures: 0 });
        }
        const tour = tours[position];
        if (tour === undefined) continue;
        const nom = nomDOutil(ligne.payload_json);
        tours[position] = {
          outils: tour.outils + 1,
          ecritures: tour.ecritures + (nom !== null && ECRIVAINS.has(nom) ? 1 : 0),
        };
      }
      return tours;
    }).pipe(Effect.mapError(toPersistenceSqlError("DetteStore.toursRecents:query")));

  return { toursRecents } satisfies DetteStoreShape;
});

export const DetteStoreLive = Layer.effect(DetteStore, makeDetteStore);
