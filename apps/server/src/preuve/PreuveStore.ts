/**
 * LE REGISTRE DE PREUVE — l'accès au flux d'activité.
 *
 * T3 enregistre déjà chaque `tool.completed` avec la commande lancée et sa
 * sortie. On LIT ce qui existe : aucune instrumentation, aucune écriture,
 * aucun nouveau schéma. C'est ce qui rend ce chantier presque gratuit chez
 * nous là où Hermès doit instrumenter son propre exécuteur d'outils.
 *
 * Toute la décision (ce qui prouve quoi, ce qui annule une preuve, ce qu'on a
 * le droit de DIRE) vit dans `PreuveCommande.ts`, qui est pur et testé sans
 * base. Ce fichier ne sait que lire et décoder.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { toPersistenceSqlError } from "../persistence/Errors.ts";
import type { PersistenceSqlError } from "../persistence/Errors.ts";
import { preuvesDeCommande, type Preuve } from "./PreuveCommande.ts";

/** Une preuve, avec le moment et la commande qui l'ont produite. */
export interface PreuveDatee extends Preuve {
  readonly commande: string;
  readonly quand: string;
}

export interface PreuveStoreShape {
  /**
   * Les preuves d'un fil, de la plus récente à la plus ancienne.
   *
   * `depuis` borne la lecture : au-delà, on relirait des vérifications
   * périmées et on présenterait comme acquis un vert d'il y a trois jours,
   * sur du code qui a changé depuis.
   */
  readonly preuvesDuFil: (
    filId: string,
    depuis: number,
  ) => Effect.Effect<PreuveDatee[], PersistenceSqlError>;
}

export class PreuveStore extends Context.Service<PreuveStore, PreuveStoreShape>()(
  "t3/preuve/PreuveStore",
) {}

interface LigneActivite {
  readonly payload_json: string;
  readonly created_at: string;
}

/**
 * Sort la commande et sa sortie d'une charge d'activité.
 *
 * Une charge illisible ou d'un autre outil rend `null` : on ignore, on ne
 * jette pas. Un registre qui casse sur une activité inattendue serait pire
 * que pas de registre — il disparaîtrait au moment où on en a besoin.
 */
export function extraireCommande(
  payload: string,
): { readonly commande: string; readonly sortie: string; readonly estErreur: boolean } | null {
  let objet: unknown;
  try {
    objet = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof objet !== "object" || objet === null) return null;
  const data = (objet as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const donnees = data as {
    toolName?: unknown;
    input?: { command?: unknown };
    result?: { content?: unknown; is_error?: unknown };
  };
  if (donnees.toolName !== "Bash") return null;
  const commande = donnees.input?.command;
  if (typeof commande !== "string" || commande.length === 0) return null;
  const contenu = donnees.result?.content;
  return {
    commande,
    sortie: typeof contenu === "string" ? contenu : JSON.stringify(contenu ?? ""),
    estErreur: donnees.result?.is_error === true,
  };
}

const makePreuveStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const preuvesDuFil: PreuveStoreShape["preuvesDuFil"] = (filId, depuis) =>
    Effect.gen(function* () {
      const lignes = yield* sql<LigneActivite>`
        SELECT payload_json, created_at
        FROM projection_thread_activities
        WHERE thread_id = ${filId} AND kind = 'tool.completed'
        ORDER BY created_at DESC
        LIMIT ${Math.max(1, depuis)}
      `;
      const preuves: PreuveDatee[] = [];
      for (const ligne of lignes) {
        const lu = extraireCommande(ligne.payload_json);
        if (lu === null) continue;
        for (const preuve of preuvesDeCommande(lu.commande, lu.sortie, lu.estErreur)) {
          preuves.push({ ...preuve, commande: lu.commande, quand: ligne.created_at });
        }
      }
      return preuves;
    }).pipe(Effect.mapError(toPersistenceSqlError("PreuveStore.preuvesDuFil:query")));

  return { preuvesDuFil } satisfies PreuveStoreShape;
});

export const PreuveStoreLive = Layer.effect(PreuveStore, makePreuveStore);
