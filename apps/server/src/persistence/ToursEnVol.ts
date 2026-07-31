/**
 * TOURS EN VOL — la seule question qu'on pose avant de couper le serveur.
 *
 * Chantier n°57, chaîne F. Le module de décision est `sauvegarde/AvantDeCouper.ts` ;
 * celui-ci ne décide rien, il fournit le fait.
 *
 * ── Pourquoi la règle est copiée sur celle du modèle de lecture ───────────
 *
 * « En vol » se lit ici comme il se lit déjà dans `ProjectionSnapshotQuery` :
 * tout ce qui n'est ni `completed`, ni `error`, ni `interrupted`. C'est
 * délibérément la MÊME règle et pas une seconde qui dirait la même chose
 * autrement — deux définitions du même fait finissent toujours par diverger,
 * et alors plus personne ne sait laquelle est vraie (A2).
 *
 * ── L'horloge entre une seule fois, et explicitement ──────────────────────
 *
 * La requête rend l'instant de départ, pas un âge. C'est `depuisQuand` qui
 * convertit, en recevant l'instant courant en paramètre : le calcul reste pur
 * et testable, et il n'y a pas d'horloge cachée dans du SQL.
 */

import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import type { TourEnVol } from "../sauvegarde/AvantDeCouper.ts";
import {
  PersistenceDecodeError,
  PersistenceSqlError,
  type ProjectionRepositoryError,
} from "./Errors.ts";

/** Un tour non clos, tel qu'il sort de la projection. */
export const TourNonClos = Schema.Struct({
  filId: Schema.String,
  commenceA: Schema.DateTimeUtcFromString,
});
export type TourNonClos = typeof TourNonClos.Type;

export class ToursEnVolRepository extends Context.Service<
  ToursEnVolRepository,
  {
    readonly lister: Effect.Effect<ReadonlyArray<TourNonClos>, ProjectionRepositoryError>;
  }
>()("t3/persistence/ToursEnVol/ToursEnVolRepository") {}

/**
 * De l'instant de départ à un âge en minutes.
 *
 * Un tour dont l'horodatage est postérieur à `maintenant` (horloge reculée,
 * base copiée d'une autre machine) rend 0 et non un âge négatif : un âge
 * négatif traverserait le seuil fantôme par le bas et se ferait compter comme
 * du travail bien vivant — le plus vieux d'abord le remonterait même en tête.
 */
export function depuisQuand(
  tours: ReadonlyArray<TourNonClos>,
  maintenant: DateTime.Utc,
): ReadonlyArray<TourEnVol> {
  return tours.map((tour) => ({
    filId: tour.filId,
    depuisMinutes: Math.max(
      0,
      Math.floor(
        (DateTime.toEpochMillis(maintenant) - DateTime.toEpochMillis(tour.commenceA)) / 60_000,
      ),
    ),
  }));
}

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const listerRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: TourNonClos,
    execute: () =>
      sql`
        SELECT
          thread_id AS "filId",
          started_at AS "commenceA"
        FROM projection_turns
        WHERE started_at IS NOT NULL
          AND state NOT IN ('completed', 'error', 'interrupted')
        ORDER BY started_at ASC
      `,
  });

  return ToursEnVolRepository.of({
    lister: listerRows(undefined).pipe(
      Effect.mapError(
        (cause): ProjectionRepositoryError =>
          Schema.isSchemaError(cause)
            ? PersistenceDecodeError.fromSchemaError("ToursEnVol.lister", cause)
            : new PersistenceSqlError({ operation: "ToursEnVol.lister", cause }),
      ),
    ),
  });
});

export const layer = Layer.effect(ToursEnVolRepository, make);
