import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const message = (
  sql: SqlClient.SqlClient,
  input: {
    readonly id: string;
    readonly filId?: string;
    readonly texte: string;
    readonly enEcriture: boolean;
  },
) => sql`
  INSERT INTO projection_thread_messages
    (message_id, thread_id, turn_id, role, text, is_streaming, created_at, updated_at)
  VALUES (
    ${input.id}, ${input.filId ?? "fil-1"}, NULL, 'assistant', ${input.texte},
    ${input.enEcriture ? 1 : 0}, '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z'
  )
  ON CONFLICT(message_id) DO UPDATE SET
    text = excluded.text,
    is_streaming = excluded.is_streaming
`;

const compterIndex = (sql: SqlClient.SqlClient) =>
  sql<{ readonly n: number }>`SELECT COUNT(*) AS n FROM thread_messages_fts`.pipe(
    Effect.map((lignes) => lignes[0]?.n ?? -1),
  );

const chercher = (sql: SqlClient.SqlClient, expression: string) =>
  sql<{
    readonly message_id: string;
  }>`SELECT message_id FROM thread_messages_fts WHERE thread_messages_fts MATCH ${expression} ORDER BY message_id`.pipe(
    Effect.map((lignes) => lignes.map((ligne) => ligne.message_id)),
  );

/**
 * La base en mémoire est PARTAGÉE par tous les tests d'un même bloc : le
 * `Layer` est mémoïsé. Sans ce ménage, un test voit les messages des
 * précédents — trois lignes d'index au lieu d'une, et un rouge qui accuse le
 * code alors que c'est le montage du test.
 */
const vider = (sql: SqlClient.SqlClient) =>
  Effect.gen(function* () {
    yield* sql`DELETE FROM projection_thread_messages`;
    yield* sql`DELETE FROM thread_messages_fts`;
  });

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("036_ThreadMessagesFts", (it) => {
  it.effect("n'indexe PAS un message encore en écriture, et l'indexe quand il se stabilise", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 36 });
      yield* vider(sql);

      // L'UPSERT est rejoué à CHAQUE jeton pendant le streaming. Indexer là
      // ferait tourner le tokenizer des centaines de fois par réponse pour
      // n'en garder que le dernier état — et ferait remonter des phrases à
      // moitié écrites dans les résultats.
      yield* message(sql, { id: "m1", texte: "le curateur arch", enEcriture: true });
      assert.equal(yield* compterIndex(sql), 0);

      yield* message(sql, { id: "m1", texte: "le curateur archive tou", enEcriture: true });
      assert.equal(yield* compterIndex(sql), 0);

      // Stabilisé : il entre, UNE seule fois malgré les trois écritures.
      yield* message(sql, {
        id: "m1",
        texte: "le curateur archive toujours, il n'efface jamais",
        enEcriture: false,
      });
      assert.equal(yield* compterIndex(sql), 1);
      assert.deepEqual(yield* chercher(sql, '"curateur"'), ["m1"]);
    }),
  );

  it.effect("suit la correction d'un message déjà stabilisé", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 36 });
      yield* vider(sql);

      yield* message(sql, { id: "m1", texte: "le voile est bleu", enEcriture: false });
      assert.deepEqual(yield* chercher(sql, '"bleu"'), ["m1"]);

      yield* message(sql, { id: "m1", texte: "le voile est rose", enEcriture: false });
      assert.deepEqual(yield* chercher(sql, '"rose"'), ["m1"]);
      // L'ancien terme ne doit plus rien rendre : sinon l'index garde une
      // vérité périmée et la recherche ment.
      assert.deepEqual(yield* chercher(sql, '"bleu"'), []);
      assert.equal(yield* compterIndex(sql), 1);
    }),
  );

  it.effect("retire du rappel un message supprimé", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 36 });
      yield* vider(sql);

      yield* message(sql, { id: "m1", texte: "une phrase à oublier", enEcriture: false });
      assert.equal(yield* compterIndex(sql), 1);

      yield* sql`DELETE FROM projection_thread_messages WHERE message_id = 'm1'`;
      assert.equal(yield* compterIndex(sql), 0);
    }),
  );

  it.effect("ignore les accents : « deploye » retrouve « déployé »", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 36 });
      yield* vider(sql);

      yield* message(sql, { id: "m1", texte: "on a déployé sur la prod", enEcriture: false });
      // Sans `remove_diacritics 2`, une recherche française rate une fois
      // sur deux — personne ne tape les accents dans une barre de recherche.
      assert.deepEqual(yield* chercher(sql, '"deploye"'), ["m1"]);
      assert.deepEqual(yield* chercher(sql, '"déployé"'), ["m1"]);
    }),
  );

  it.effect("garde le fil d'origine de chaque trouvaille", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 36 });
      yield* vider(sql);

      yield* message(sql, {
        id: "m1",
        filId: "fil-A",
        texte: "le swipe déraille",
        enEcriture: false,
      });
      yield* message(sql, {
        id: "m2",
        filId: "fil-B",
        texte: "le swipe est réparé",
        enEcriture: false,
      });

      const lignes = yield* sql<{
        readonly message_id: string;
        readonly thread_id: string;
      }>`SELECT message_id, thread_id FROM thread_messages_fts WHERE thread_messages_fts MATCH '"swipe"' ORDER BY message_id`;
      assert.deepEqual(
        lignes.map((ligne) => [ligne.message_id, ligne.thread_id]),
        [
          ["m1", "fil-A"],
          ["m2", "fil-B"],
        ],
      );
    }),
  );
});

/**
 * Bloc SÉPARÉ, donc base vierge.
 *
 * Ce test s'arrête volontairement AVANT la migration 036 pour qu'il existe
 * des messages au moment où l'index arrive. Dans le bloc précédent, 036 est
 * déjà appliquée et ne se rejoue pas — le remplissage n'y serait donc jamais
 * exercé, alors que c'est lui qui décide si tout l'historique d'avant la
 * migration reste trouvable.
 */
const layerVierge = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layerVierge("036_ThreadMessagesFts — remplissage de l'existant", (it) => {
  it.effect("indexe ce qui existait déjà, et laisse dehors ce qui s'écrivait", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 35 });

      yield* message(sql, { id: "ancien", texte: "une conversation d'avant", enEcriture: false });
      yield* message(sql, { id: "encours", texte: "à moitié écrit", enEcriture: true });

      yield* runMigrations({ toMigrationInclusive: 36 });

      assert.deepEqual(yield* chercher(sql, '"conversation"'), ["ancien"]);
      assert.equal(yield* compterIndex(sql), 1);
    }),
  );
});
