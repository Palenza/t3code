/**
 * RETROUVER UNE CONVERSATION D'IL Y A TROIS SEMAINES — l'index.
 *
 * Jusqu'ici, tout ce qui n'était pas dans le fil ouvert était perdu : la
 * recherche de T3 (`WorkspaceSearchIndex`) fouille les FICHIERS du projet,
 * jamais les conversations. Repris d'Hermès (`tools/session_search_tool.py`),
 * dont la trouvaille est qu'une recherche de rappel n'a besoin d'AUCUN appel
 * de modèle : FTS5 rend les messages eux-mêmes.
 *
 * ── Pourquoi une table AUTONOME plutôt qu'un contenu externe ────────────────
 *
 * FTS5 sait indexer une table existante sans dupliquer le texte
 * (`content='projection_thread_messages'`). C'est plus économe, et c'est
 * pourtant le mauvais choix ici : l'index se lie alors aux `rowid` de la
 * source, et le moindre décalage rend des résultats FAUX en silence.
 *
 * Le reçu qui tranche, mesuré sur la base réelle du fondateur le 31/07 :
 * 3 813 messages, 2,4 Mo de texte, dans une base de 402 Mo. Dupliquer coûte
 * 0,6 % du fichier. On paie ces 0,6 % pour un index qu'on peut RECONSTRUIRE
 * d'une seule requête si quoi que ce soit dérive.
 *
 * ── L'invariant : on n'indexe pas ce qui s'écrit encore ─────────────────────
 *
 * `projection_thread_messages` est réécrite par UPSERT à CHAQUE jeton pendant
 * le streaming. Indexer sur toute écriture ferait tourner le tokenizer des
 * centaines de fois par réponse, pour n'en garder que le dernier état.
 *
 * Les déclencheurs ne regardent donc que les messages STABILISÉS
 * (`is_streaming = 0`). Un message en cours d'écriture n'existe pas pour la
 * recherche — ce qui est aussi la bonne sémantique : on ne rappelle pas une
 * phrase à moitié écrite.
 *
 * ── Le tokenizer ───────────────────────────────────────────────────────────
 *
 * `unicode61` avec `remove_diacritics 2` : « déployé » se trouve en tapant
 * « deploye ». Sans ça, une recherche française rate une fois sur deux.
 */
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE VIRTUAL TABLE IF NOT EXISTS thread_messages_fts USING fts5(
      message_id UNINDEXED,
      thread_id UNINDEXED,
      text,
      tokenize = 'unicode61 remove_diacritics 2'
    )
  `;

  // On repart d'un index vide : cette migration ne tourne qu'une fois, mais un
  // rejeu manuel ne doit jamais fabriquer de doublons.
  yield* sql`DELETE FROM thread_messages_fts`;

  yield* sql`
    INSERT INTO thread_messages_fts (message_id, thread_id, text)
    SELECT message_id, thread_id, text
    FROM projection_thread_messages
    WHERE is_streaming = 0 AND LENGTH(text) > 0
  `;

  // ── Les déclencheurs ──────────────────────────────────────────────────────
  //
  // On supprime AVANT d'insérer dans les deux sens : l'UPSERT du streaming
  // repasse par INSERT autant que par UPDATE selon le chemin d'écriture, et
  // sans ce ménage un message stabilisé après vingt jetons entrerait vingt
  // fois dans l'index.

  yield* sql`DROP TRIGGER IF EXISTS thread_messages_fts_ai`;
  yield* sql`
    CREATE TRIGGER thread_messages_fts_ai
    AFTER INSERT ON projection_thread_messages
    WHEN new.is_streaming = 0 AND LENGTH(new.text) > 0
    BEGIN
      DELETE FROM thread_messages_fts WHERE message_id = new.message_id;
      INSERT INTO thread_messages_fts (message_id, thread_id, text)
      VALUES (new.message_id, new.thread_id, new.text);
    END
  `;

  yield* sql`DROP TRIGGER IF EXISTS thread_messages_fts_au`;
  yield* sql`
    CREATE TRIGGER thread_messages_fts_au
    AFTER UPDATE ON projection_thread_messages
    BEGIN
      DELETE FROM thread_messages_fts WHERE message_id = new.message_id;
      INSERT INTO thread_messages_fts (message_id, thread_id, text)
      SELECT new.message_id, new.thread_id, new.text
      WHERE new.is_streaming = 0 AND LENGTH(new.text) > 0;
    END
  `;

  yield* sql`DROP TRIGGER IF EXISTS thread_messages_fts_ad`;
  yield* sql`
    CREATE TRIGGER thread_messages_fts_ad
    AFTER DELETE ON projection_thread_messages
    BEGIN
      DELETE FROM thread_messages_fts WHERE message_id = old.message_id;
    END
  `;
});
