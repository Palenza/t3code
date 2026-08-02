/**
 * LE RAPPEL — l'accès à l'index.
 *
 * Trois primitives, et rien d'autre. Toute la décision (quel mode, quel
 * classement, quelle fenêtre, quelles bornes) vit dans `RappelRequete.ts`,
 * qui est pur et testé sans base. Ce fichier ne sait que lire.
 *
 * L'index lui-même est posé par la migration 036, et son invariant y est
 * écrit : on n'indexe que les messages STABILISÉS. Un message en cours
 * d'écriture n'existe pas pour la recherche.
 *
 * Reçu de performance, mesuré sur la base réelle du fondateur le 31/07 :
 * 3 816 messages indexés en 103 ms, découverte en 0 à 5 ms, index +5 Mo sur
 * une base de 403 Mo.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { toPersistenceSqlError } from "../persistence/Errors.ts";
import type { PersistenceSqlError } from "../persistence/Errors.ts";
import type { MessageDeFil, TrouvailleBrute } from "./RappelRequete.ts";

/** Un fil, tel qu'on le liste en mode parcours. */
export interface FilRecent {
  readonly filId: string;
  readonly titre: string;
  readonly majA: string;
  readonly archive: boolean;
}

export interface RappelStoreShape {
  /**
   * Les messages qui correspondent, du meilleur au pire. On rend BRUT et
   * large : le regroupement par fil et la rétrogradation des archivés sont
   * des décisions, elles appartiennent à la règle pure.
   */
  readonly chercher: (
    expressionMatch: string,
    limiteBrute: number,
  ) => Effect.Effect<TrouvailleBrute[], PersistenceSqlError>;

  /** Tous les messages d'un fil, dans l'ordre — de quoi tailler une fenêtre. */
  readonly messagesDuFil: (filId: string) => Effect.Effect<MessageDeFil[], PersistenceSqlError>;

  /** Les fils vivants, du plus récemment touché au plus ancien. */
  readonly filsRecents: (plafond: number) => Effect.Effect<FilRecent[], PersistenceSqlError>;
}

export class RappelStore extends Context.Service<RappelStore, RappelStoreShape>()(
  "t3/rappel/RappelStore",
) {}

interface LigneTrouvaille {
  readonly message_id: string;
  readonly thread_id: string;
  readonly score: number;
  readonly archive: number;
}

interface LigneMessage {
  readonly message_id: string;
  readonly role: string;
  readonly text: string;
  readonly created_at: string;
}

interface LigneFil {
  readonly thread_id: string;
  readonly title: string;
  readonly updated_at: string;
  readonly archive: number;
}

const makeRappelStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const chercher: RappelStoreShape["chercher"] = (expressionMatch, limiteBrute) =>
    Effect.gen(function* () {
      // `ORDER BY score` : bm25 rend du NÉGATIF, plus petit = meilleur.
      //
      // Les fils supprimés sont écartés ici, à la source. Les ARCHIVÉS
      // remontent avec leur drapeau — on les rétrograde plus tard, on ne les
      // efface pas : exclure fabrique une cécité de rappel (leçon Hermès
      // #19434), et un fil rangé reste la bonne réponse quand c'est la seule.
      const lignes = yield* sql<LigneTrouvaille>`
        SELECT
          f.message_id AS message_id,
          f.thread_id AS thread_id,
          bm25(thread_messages_fts) AS score,
          CASE WHEN t.archived_at IS NULL THEN 0 ELSE 1 END AS archive
        FROM thread_messages_fts f
        JOIN projection_threads t ON t.thread_id = f.thread_id
        WHERE thread_messages_fts MATCH ${expressionMatch}
          AND t.deleted_at IS NULL
        ORDER BY score
        LIMIT ${Math.max(1, limiteBrute)}
      `;
      return lignes.map((ligne) => ({
        messageId: ligne.message_id,
        filId: ligne.thread_id,
        score: ligne.score,
        filArchive: ligne.archive === 1,
      }));
    }).pipe(Effect.mapError(toPersistenceSqlError("RappelStore.chercher:query")));

  const messagesDuFil: RappelStoreShape["messagesDuFil"] = (filId) =>
    Effect.gen(function* () {
      // On rend le fil ENTIER plutôt qu'une tranche : tailler la fenêtre et
      // les bornes en SQL demanderait trois requêtes et une arithmétique
      // d'index dupliquée. Un fil de conversation tient en mémoire — le plus
      // gros de la base du fondateur fait 2,4 Mo POUR TOUS LES FILS.
      const lignes = yield* sql<LigneMessage>`
        SELECT message_id, role, text, created_at
        FROM projection_thread_messages
        WHERE thread_id = ${filId} AND is_streaming = 0
        ORDER BY created_at ASC, message_id ASC
      `;
      return lignes.map((ligne) => ({
        messageId: ligne.message_id,
        role: ligne.role,
        texte: ligne.text,
        creeA: ligne.created_at,
      }));
    }).pipe(Effect.mapError(toPersistenceSqlError("RappelStore.messagesDuFil:query")));

  const filsRecents: RappelStoreShape["filsRecents"] = (plafond) =>
    Effect.gen(function* () {
      const lignes = yield* sql<LigneFil>`
        SELECT
          thread_id,
          title,
          updated_at,
          CASE WHEN archived_at IS NULL THEN 0 ELSE 1 END AS archive
        FROM projection_threads
        WHERE deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT ${Math.max(1, plafond)}
      `;
      return lignes.map((ligne) => ({
        filId: ligne.thread_id,
        titre: ligne.title,
        majA: ligne.updated_at,
        archive: ligne.archive === 1,
      }));
    }).pipe(Effect.mapError(toPersistenceSqlError("RappelStore.filsRecents:query")));

  return { chercher, messagesDuFil, filsRecents } satisfies RappelStoreShape;
});

export const RappelStoreLive = Layer.effect(RappelStore, makeRappelStore);
