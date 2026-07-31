import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { passerLaPorte, porteDeSortie } from "./DebordementSurDisque.ts";
import { alleger, empreinteCourte, PLAFOND_SORTIE } from "./SortieDOutil.ts";

describe("alleger", () => {
  it("ne touche à rien sous le plafond", () => {
    const petit = { carte: "abc", n: 1 };
    const r = alleger(petit, PLAFOND_SORTIE, "/tmp/x.json");
    assert.isFalse(r.allege);
    assert.equal(r.retires, 0);
    assert.deepEqual(r.valeur, petit);
  });

  it("rogne la PLUS GROSSE chaîne et épargne les petites", () => {
    // Les petites chaînes sont les plus denses en information : un nom, un
    // chemin, un verdict. Couper également les sacrifierait pour épargner la
    // grosse.
    const valeur = { nom: "carte-du-depot", verdict: "ok", contenu: "x".repeat(50_000) };
    const r = alleger(valeur, 10_000, "/tmp/x.json");
    assert.isTrue(r.allege);
    assert.equal(r.valeur.nom, "carte-du-depot");
    assert.equal(r.valeur.verdict, "ok");
    assert.isBelow(r.valeur.contenu.length, 3_000);
  });

  it("laisse une TÊTE utile et un pointeur qui nomme le champ", () => {
    const valeur = { contenu: `DÉBUT-IMPORTANT${"y".repeat(50_000)}` };
    const r = alleger(valeur, 5_000, "/tmp/sorties/abc.json");
    assert.isTrue(r.valeur.contenu.startsWith("DÉBUT-IMPORTANT"));
    assert.include(r.valeur.contenu, "/tmp/sorties/abc.json");
    assert.include(r.valeur.contenu, "contenu");
    assert.include(r.valeur.contenu, "tronqué");
  });

  it("GARDE LA FORME — mêmes clés, mêmes types", () => {
    // Une porte qui change la forme est une porte qu'on débranche : les
    // schémas des outils la refuseraient.
    const valeur = { a: "z".repeat(40_000), b: 7, c: true, d: ["x", "y"], e: { f: null } };
    const r = alleger(valeur, 1_000, "/tmp/x.json");
    assert.deepEqual(Object.keys(r.valeur), ["a", "b", "c", "d", "e"]);
    assert.equal(typeof r.valeur.a, "string");
    assert.equal(r.valeur.b, 7);
    assert.equal(r.valeur.c, true);
    assert.deepEqual(r.valeur.d, ["x", "y"]);
    assert.deepEqual(r.valeur.e, { f: null });
  });

  it("descend dans les tableaux et les objets imbriqués", () => {
    const valeur = { messages: [{ texte: "a".repeat(60_000) }, { texte: "court" }] };
    const r = alleger(valeur, 5_000, "/tmp/x.json");
    assert.isTrue(r.allege);
    assert.equal(r.valeur.messages[1]?.texte, "court");
    assert.isBelow(r.valeur.messages[0]?.texte.length ?? 0, 3_000);
  });

  it("NE MUTE PAS la valeur d'origine", () => {
    // Elle vient du gestionnaire, qui peut encore s'en servir.
    const valeur = { contenu: "w".repeat(40_000) };
    alleger(valeur, 1_000, "/tmp/x.json");
    assert.equal(valeur.contenu.length, 40_000);
  });

  it("s'arrête dès qu'on repasse sous le plafond", () => {
    // Deux gros champs, un seul suffit à repasser dessous : le second reste
    // intact. Alléger plus que nécessaire coûterait de l'information pour rien.
    const valeur = { gros: "a".repeat(50_000), moyen: "b".repeat(4_000) };
    const r = alleger(valeur, 10_000, "/tmp/x.json");
    assert.equal(r.valeur.moyen.length, 4_000);
  });
});

describe("empreinteCourte", () => {
  it("est STABLE — même contenu, même nom de fichier", () => {
    // Déterministe à dessein : sans ça le dossier grossirait sans fin.
    assert.equal(empreinteCourte("bonjour"), empreinteCourte("bonjour"));
  });

  it("distingue deux contenus", () => {
    assert.notEqual(empreinteCourte("a"), empreinteCourte("b"));
  });

  it("rend toujours 8 caractères hexadécimaux", () => {
    for (const t of ["", "a", "x".repeat(10_000), "héllo ünicode"]) {
      assert.match(empreinteCourte(t), /^[0-9a-f]{8}$/u);
    }
  });
});

it.layer(NodeServices.layer, { excludeTestServices: true })("porteDeSortie", (it) => {
  it.effect("laisse passer une sortie normale sans écrire quoi que ce soit", () =>
    Effect.gen(function* () {
      const rendu = yield* porteDeSortie({ carte: "petit", note: "déjà là" });
      assert.equal(rendu.carte, "petit");
      assert.equal(rendu.note, "déjà là");
    }),
  );

  it.effect("caviarde AVANT tout le reste", () =>
    Effect.gen(function* () {
      const rendu = yield* passerLaPorte({ texte: "clé sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ" });
      assert.notInclude(rendu.valeur.texte, "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    }),
  );

  it.effect("au-dessus du plafond : l'intégral sur disque, un pointeur dans le contexte", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const enorme = "Z".repeat(PLAFOND_SORTIE + 50_000);
      const rendu = yield* passerLaPorte({ contenu: enorme });

      // 1 · le contexte est redescendu très en dessous du plafond
      assert.isBelow(rendu.valeur.contenu.length, 3_000);

      // 2 · la note nomme le fichier (A7)
      const note = rendu.notes.join(" ");
      const chemin = /(\/[^\s]+\.json)/u.exec(note)?.[1];
      assert.isString(chemin, `aucune note ne nomme de fichier : ${note}`);

      // 3 · RIEN N'EST PERDU — le fichier porte l'intégral (H6)
      const surDisque = yield* fileSystem.readFileString(chemin as string).pipe(Effect.orDie);
      assert.include(surDisque, enorme, "l'intégral n'est pas sur disque");
      yield* fileSystem.remove(chemin as string).pipe(Effect.orElseSucceed(() => undefined));
    }),
  );

  it.effect("deux sorties identiques réécrivent le MÊME fichier", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const valeur = { contenu: "K".repeat(PLAFOND_SORTIE + 10_000) };
      const un = yield* passerLaPorte(valeur);
      const deux = yield* passerLaPorte(valeur);
      const chemin = (notes: ReadonlyArray<string>) =>
        /(\/[^\s]+\.json)/u.exec(notes.join(" "))?.[1];
      assert.equal(chemin(un.notes), chemin(deux.notes));
      yield* fileSystem
        .remove(chemin(un.notes) as string)
        .pipe(Effect.orElseSucceed(() => undefined));
    }),
  );
});
