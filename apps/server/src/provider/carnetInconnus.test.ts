import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, it } from "@effect/vitest";
import { assert } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  configurerCarnet,
  lireCarnet,
  noter,
  noterInconnu,
  parFrequence,
  recurrents,
  signatureDe,
  viderCarnet,
  type EntreeCarnet,
} from "./carnetInconnus.ts";

const VIDE: ReadonlyArray<EntreeCarnet> = [];

describe("carnet des inconnus — la normalisation", () => {
  it("fond les parties variables, sinon le seuil de deux n'est JAMAIS atteint", () => {
    // Le cas réel : un message de quota porte l'heure de reprise et un
    // identifiant de requête. Sans normalisation, chaque occurrence est un
    // inconnu neuf, et l'alarme qui se déclenche à la deuxième ne se
    // déclenche jamais — le carnet compterait sans jamais alerter.
    assert.strictEqual(
      signatureDe("Usage limit reached. Resets at 3pm (request 4f2a91)"),
      signatureDe("Usage limit reached. Resets at 11pm (request 8c7d02)"),
    );
  });

  it("fond les UUID", () => {
    assert.strictEqual(
      signatureDe("session 550e8400-e29b-41d4-a716-446655440000 expired"),
      signatureDe("session 6ba7b810-9dad-11d1-80b4-00c04fd430c8 expired"),
    );
  });

  it("ne fond PAS deux pannes réellement différentes", () => {
    // Le risque symétrique : une normalisation trop gourmande masquerait deux
    // vraies causes sous un seul compteur.
    assert.notStrictEqual(signatureDe("out of usage credits"), signatureDe("oauth token expired"));
  });
});

describe("carnet des inconnus — le compteur", () => {
  const midi = "2026-07-30T12:00:00Z";
  const treize = "2026-07-30T13:00:00Z";

  it("regroupe et compte au lieu d'empiler", () => {
    const carnet = noter(
      noter(VIDE, { message: "weird failure 12", compte: "a", maintenant: midi }),
      {
        message: "weird failure 47",
        compte: "b",
        maintenant: treize,
      },
    );

    assert.strictEqual(carnet.length, 1);
    assert.strictEqual(carnet[0]?.occurrences, 2);
    assert.deepStrictEqual(carnet[0]?.comptes, ["a", "b"]);
    // L'exemplaire est le message BRUT du premier passage : c'est lui qu'un
    // humain lit pour écrire le motif manquant.
    assert.strictEqual(carnet[0]?.exemple, "weird failure 12");
    assert.strictEqual(carnet[0]?.premiereVue, midi);
    assert.strictEqual(carnet[0]?.derniereVue, treize);
  });

  it("ne compte pas deux fois le même compte", () => {
    const carnet = noter(noter(VIDE, { message: "x 1", compte: "a", maintenant: midi }), {
      message: "x 2",
      compte: "a",
      maintenant: treize,
    });
    assert.deepStrictEqual(carnet[0]?.comptes, ["a"]);
  });

  it("le plus vu passe en tête — l'ordre EST le jugement", () => {
    let carnet = noter(VIDE, { message: "rare", compte: "a", maintenant: midi });
    for (const i of [1, 2, 3]) {
      carnet = noter(carnet, { message: `courant ${i}`, compte: "a", maintenant: midi });
    }
    assert.strictEqual(parFrequence(carnet)[0]?.occurrences, 3);
  });

  it("une occurrence ne déclenche pas l'arrêt-de-chaîne ; deux, oui", () => {
    const une = noter(VIDE, { message: "panne inédite", compte: "a", maintenant: midi });
    assert.deepStrictEqual(recurrents(une), []);

    const deux = noter(une, { message: "panne inédite", compte: "a", maintenant: treize });
    assert.strictEqual(recurrents(deux).length, 1);
  });

  it("ignore un message vide plutôt que de compter du néant", () => {
    assert.deepStrictEqual(noter(VIDE, { message: "   ", compte: "a", maintenant: midi }), VIDE);
  });
});

const AvecDisque = NodeServices.layer;

describe("carnet des inconnus — la persistance", () => {
  it.effect(
    "survit au redémarrage : c'est TOUT l'intérêt",
    () =>
      Effect.gen(function* () {
        // Sans disque, on repart de zéro à chaque relance et on n'atteint
        // jamais la deuxième occurrence qui déclenche l'alarme. L'oubli serait
        // la panne, pas une économie.
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dossier = yield* fs.makeTempDirectoryScoped({ prefix: "carnet-" });
        const fichier = path.join(dossier, "carnet.json");

        viderCarnet();
        configurerCarnet(fichier);
        yield* noterInconnu({
          message: "panne obscure",
          compte: "a",
          maintenant: "2026-07-30T10:00:00Z",
        });

        // Le « redémarrage » : plus rien en mémoire, seul le fichier subsiste.
        viderCarnet();
        configurerCarnet(fichier);
        yield* noterInconnu({
          message: "panne obscure",
          compte: "b",
          maintenant: "2026-07-30T12:00:00Z",
        });

        const carnet = yield* lireCarnet();
        assert.strictEqual(carnet.length, 1);
        assert.strictEqual(carnet[0]?.occurrences, 2, "la relance doit CUMULER, pas repartir à 1");
        assert.deepStrictEqual(carnet[0]?.comptes, ["a", "b"]);
        viderCarnet();
      }).pipe(Effect.scoped, Effect.provide(AvecDisque)),
    { timeout: 20_000 },
  );

  it.effect(
    "ce qui a été noté AVANT le câblage n'est pas perdu",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dossier = yield* fs.makeTempDirectoryScoped({ prefix: "carnet-" });
        const fichier = path.join(dossier, "carnet.json");

        viderCarnet();
        // Aucun chemin : la note doit rester en mémoire, pas disparaître.
        yield* noterInconnu({
          message: "note orpheline",
          compte: "a",
          maintenant: "2026-07-30T10:00:00Z",
        });
        configurerCarnet(fichier);
        yield* noterInconnu({
          message: "autre chose",
          compte: "a",
          maintenant: "2026-07-30T11:00:00Z",
        });

        const signatures = (yield* lireCarnet()).map((e) => e.exemple);
        assert.ok(signatures.includes("note orpheline"), "la note d'avant câblage doit survivre");
        viderCarnet();
      }).pipe(Effect.scoped, Effect.provide(AvecDisque)),
    { timeout: 20_000 },
  );

  it.effect(
    "un fichier corrompu ne fait pas tomber le serveur",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dossier = yield* fs.makeTempDirectoryScoped({ prefix: "carnet-" });
        const fichier = path.join(dossier, "carnet.json");
        yield* fs.writeFileString(fichier, "{ ceci n'est pas du JSON");

        viderCarnet();
        configurerCarnet(fichier);
        // Ni exception, ni carnet fantôme : on repart proprement.
        assert.deepStrictEqual(yield* lireCarnet(), []);
        yield* noterInconnu({
          message: "après corruption",
          compte: "a",
          maintenant: "2026-07-30T10:00:00Z",
        });
        assert.strictEqual((yield* lireCarnet()).length, 1);
        viderCarnet();
      }).pipe(Effect.scoped, Effect.provide(AvecDisque)),
    { timeout: 20_000 },
  );
});
