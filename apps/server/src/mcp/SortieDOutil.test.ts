import { assert, describe, it } from "@effect/vitest";

import { avecNotes, transformerSortie, PLAFOND_SORTIE } from "./SortieDOutil.ts";

describe("transformerSortie", () => {
  it("caviarde EN PROFONDEUR, pas seulement à la racine", () => {
    // C'est le trou réel : `rappel` rend des messages d'un AUTRE fil, imbriqués
    // à trois niveaux. Une clé collée dans le fil A pouvait atterrir dans le
    // contexte du fil B.
    const cle = `sk-ant-api03-${"A".repeat(40)}`;
    const t = transformerSortie({
      fils: [{ fenetre: [{ texte: `ma clé est ${cle}` }] }],
    });
    const rendu = JSON.stringify(t.valeur);
    assert.notInclude(rendu, "A".repeat(40));
    assert.include(rendu, "sk-ant");
  });

  it("garde la FORME — mêmes clés, mêmes types", () => {
    // Une porte qui change la forme casse les schémas déclarés par les outils,
    // et une porte qui casse se fait débrancher.
    const source = { a: "x", b: 42, c: true, d: null, e: ["y", 1], f: { g: "z" } };
    const t = transformerSortie(source);
    assert.deepEqual(Object.keys(t.valeur), Object.keys(source));
    assert.equal(t.valeur.b, 42);
    assert.equal(t.valeur.c, true);
    assert.equal(t.valeur.d, null);
    assert.deepEqual(t.valeur.e, ["y", 1]);
  });

  it("ne dit rien quand il n'y a rien à dire", () => {
    const t = transformerSortie({ note: "tout va bien", n: 3 });
    assert.deepEqual(t.notes, []);
    assert.equal(avecNotes(t).note, "tout va bien");
  });

  it("compte les champs caviardés et le DIT", () => {
    const t = transformerSortie({
      un: `sk-ant-api03-${"B".repeat(40)}`,
      deux: `ghp_${"C".repeat(36)}`,
      trois: "rien à cacher",
    });
    assert.equal(t.notes.length, 1);
    assert.include(t.notes[0] ?? "", "2 champ(s)");
  });

  it("crie quand la sortie dépasse, sans TRONQUER", () => {
    // Couper au milieu d'un JSON rendrait une structure invalide. L'outil sait
    // mieux que nous quoi sacrifier : on le dit, il répare à la source.
    const enorme = { texte: "x".repeat(PLAFOND_SORTIE + 1_000) };
    const t = transformerSortie(enorme);
    assert.isTrue(t.notes.some((n) => n.includes("plafond")));
    // Rien n'a été coupé : la structure est intacte.
    assert.equal(t.valeur.texte.length, PLAFOND_SORTIE + 1_000);
  });

  it("ne crie pas sur une sortie normale", () => {
    const t = transformerSortie({ texte: "x".repeat(1_000) });
    assert.deepEqual(t.notes, []);
  });

  it("supporte les valeurs nues et le vide", () => {
    assert.equal(transformerSortie("texte").valeur, "texte");
    assert.equal(transformerSortie(42).valeur, 42);
    assert.deepEqual(transformerSortie([]).valeur, []);
    assert.deepEqual(transformerSortie({}).valeur, {});
  });
});

describe("avecNotes", () => {
  it("ajoute au champ `note` existant sans l'écraser", () => {
    // Un lecteur qui voit « sk-ant***f3a9 » sans explication cherche pourquoi
    // la clé ne marche pas.
    const t = transformerSortie({
      note: "5 fils touchés.",
      texte: `sk-ant-api03-${"D".repeat(40)}`,
    });
    const rendu = avecNotes(t);
    assert.include(rendu.note ?? "", "5 fils touchés.");
    assert.include(rendu.note ?? "", "caviardé");
  });

  it("crée la note quand il n'y en avait pas", () => {
    const t = transformerSortie({ texte: `ghp_${"E".repeat(36)}` });
    const rendu = avecNotes(t as never) as { note?: string };
    assert.include(rendu.note ?? "", "caviardé");
  });
});
