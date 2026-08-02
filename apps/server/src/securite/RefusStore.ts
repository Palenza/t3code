/**
 * LES REFUS D'OUTIL, AVEC LEUR COMMANDE.
 *
 * La lecture du chantier n°12. Le jugement est dans
 * `SuggestionsDAutorisation.ts`, qui reste pur.
 *
 * ── Ce que la jointure a corrigé, et il faut le dire ─────────────────────
 *
 * J'avais conclu le 01/08 que la commande refusée « n'est enregistrée nulle
 * part » : le message du SDK ne porte que `tool_name` et `tool_use_id`, et
 * `ItemLifecyclePayload` n'a pas d'identifiant. J'en ai déduit qu'il fallait
 * ajouter une clé, et je l'ai ajoutée.
 *
 * La déduction était fausse. `tool.completed` porte déjà
 * `data.result.tool_use_id` — le même identifiant que le refus — À CÔTÉ de
 * `data.input`, qui contient la commande. Mesuré : 8 236 activités le
 * portent, et la jointure retrouve **13 des 13** refus enregistrés.
 *
 * La clé que j'ai ajoutée ailleurs n'était donc pas nécessaire. Elle ne gêne
 * pas, mais elle n'a jamais rien débloqué — c'est la cinquième fois de la
 * session qu'aller LIRE la donnée renverse un verdict tiré du raisonnement
 * (A1 : un état se vérifie, il ne se déduit pas).
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { toPersistenceSqlError } from "../persistence/Errors.ts";
import type { PersistenceSqlError } from "../persistence/Errors.ts";
import type { Refus } from "./SuggestionsDAutorisation.ts";

export interface RefusStoreShape {
  readonly refus: () => Effect.Effect<ReadonlyArray<Refus>, PersistenceSqlError>;
}

export class RefusStore extends Context.Service<RefusStore, RefusStoreShape>()(
  "t3/securite/RefusStore",
) {}

interface LigneRefus {
  readonly outil: string | null;
  readonly commande: string | null;
  readonly jour: string | null;
}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const refus: RefusStoreShape["refus"] = () =>
    Effect.gen(function* () {
      // LEFT JOIN, pas JOIN. Un refus dont la commande reste introuvable doit
      // apparaître avec `commande = null` : le suggéreur le compte alors
      // comme une preuve MANQUANTE et le dit. Un JOIN strict le ferait
      // disparaître, et « 4 refus examinés » se lirait comme le total réel
      // alors qu'il y en avait 13.
      const lignes = yield* sql<LigneRefus>`
        SELECT json_extract(d.payload_json, '$.toolName') AS outil,
               json_extract(c.payload_json, '$.data.input.command') AS commande,
               substr(d.created_at, 1, 10) AS jour
        FROM projection_thread_activities d
        LEFT JOIN projection_thread_activities c
          ON c.kind = 'tool.completed'
         AND json_extract(c.payload_json, '$.data.result.tool_use_id')
             = json_extract(d.payload_json, '$.toolUseId')
        WHERE d.kind = 'tool.denied'
        ORDER BY d.created_at ASC
      `;
      return lignes.flatMap((ligne) =>
        ligne.outil == null || ligne.jour == null
          ? []
          : [{ outil: ligne.outil, commande: ligne.commande, jour: ligne.jour }],
      );
    }).pipe(Effect.mapError(toPersistenceSqlError("RefusStore.refus:query")));

  return { refus } satisfies RefusStoreShape;
});

export const RefusStoreLive = Layer.effect(RefusStore, make);
