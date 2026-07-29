// @effect-diagnostics nodeBuiltinImport:off - Le test manipule la file sur disque directement.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { assert, describe, it, beforeEach } from "vite-plus/test";

// Un fichier À NOUS : la première version de ce test visait le vrai
// `~/.t3/favoris-en-attente.jsonl` et a effacé une file réelle en tournant.
const FICHIER = NodePath.join(
  NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "favoris-")),
  "en-attente.jsonl",
);
process.env["T3_FAVORIS_EN_ATTENTE"] = FICHIER;

const { empilerFavori, releverFavoris } = await import("./favorisEnAttente.ts");

const viderFile = () => {
  try {
    NodeFS.rmSync(FICHIER);
  } catch {
    // Déjà absent : c'est l'état voulu.
  }
};

describe("favoris en attente", () => {
  beforeEach(viderFile);

  it("relève ce qui a été déposé, dans l'ordre du dépôt", () => {
    empilerFavori({ url: "http://localhost:4321/banc.html", titre: "Banc", espace: "Design" });
    empilerFavori({ url: "https://exemple.test/revue" });

    const releves = releverFavoris();

    assert.deepStrictEqual(releves, [
      { url: "http://localhost:4321/banc.html", titre: "Banc", espace: "Design" },
      { url: "https://exemple.test/revue" },
    ]);
  });

  it("vide la file : deux relèves de suite ne livrent jamais deux fois", () => {
    empilerFavori({ url: "https://exemple.test/une-fois" });

    assert.strictEqual(releverFavoris().length, 1);
    // Sans le vidage, le lien se ré-épinglerait à chaque tour de minuterie.
    assert.deepStrictEqual(releverFavoris(), []);
  });

  it("une ligne abîmée ne bloque pas ses voisines", () => {
    empilerFavori({ url: "https://exemple.test/avant" });
    NodeFS.appendFileSync(FICHIER, "{ceci n'est pas du json\n", "utf8");
    empilerFavori({ url: "https://exemple.test/apres" });

    // Sinon une seule ligne corrompue gèlerait la file pour toujours.
    assert.deepStrictEqual(
      releverFavoris().map((favori) => favori.url),
      ["https://exemple.test/avant", "https://exemple.test/apres"],
    );
  });

  it("file absente = rien à relever, pas une erreur", () => {
    assert.deepStrictEqual(releverFavoris(), []);
  });
});
