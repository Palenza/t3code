import { assert, describe, it } from "@effect/vitest";

import {
  messageDeRecuperation,
  nomDeMiseALAbri,
  recuperationPartielle,
} from "./RecuperationPartielle.ts";

/** Un décodeur d'essai : refuse toute valeur non booléenne sur les clés citées. */
const refuse =
  (...cassees: ReadonlyArray<string>) =>
  (candidat: Record<string, unknown>) =>
    cassees.every((cle) => !(cle in candidat));

describe("recuperationPartielle", () => {
  it("ne touche à rien quand tout décode", () => {
    const objet = { a: 1, b: 2 };
    const r = recuperationPartielle(objet, () => true);
    assert.isTrue(r.intact);
    assert.deepEqual(r.garde, objet);
    assert.deepEqual(r.perdues, []);
  });

  it("garde les comptes quand UNE clé est cassée", () => {
    // Le cas qui compte. Aujourd'hui, une seule clé malformée fait retomber
    // TOUS les réglages aux défauts — `providerInstances` compris, qui porte
    // les trois comptes Max. La première écriture les efface du disque.
    const objet = {
      providerInstances: { A: {}, B: {}, C: {} },
      voice: "cassé",
      enableAssistantStreaming: true,
    };
    const r = recuperationPartielle(objet, refuse("voice"));
    assert.deepEqual(r.garde["providerInstances"], { A: {}, B: {}, C: {} });
    assert.equal(r.garde["enableAssistantStreaming"], true);
    assert.isFalse("voice" in r.garde);
  });

  it("NOMME ce qui a été écarté, avec un aperçu de la valeur reçue", () => {
    const r = recuperationPartielle({ ok: 1, voice: "cassé" }, refuse("voice"));
    assert.equal(r.perdues.length, 1);
    assert.equal(r.perdues[0]?.cle, "voice");
    assert.include(r.perdues[0]?.pourquoi ?? "", "cassé");
  });

  it("borne l'aperçu d'une valeur énorme", () => {
    const r = recuperationPartielle({ gros: "x".repeat(500) }, refuse("gros"));
    assert.isBelow(r.perdues[0]?.pourquoi.length ?? 0, 140);
    assert.include(r.perdues[0]?.pourquoi ?? "", "…");
  });

  it("est DÉTERMINISTE : deux passages rendent le même résultat", () => {
    // Un rétablissement qui varie d'un démarrage à l'autre est impossible à
    // diagnostiquer.
    const objet = { a: 1, mauvais: 2, b: 3, autreMauvais: 4 };
    const une = recuperationPartielle(objet, refuse("mauvais", "autreMauvais"));
    const deux = recuperationPartielle(objet, refuse("mauvais", "autreMauvais"));
    assert.deepEqual(une.garde, deux.garde);
    assert.deepEqual(une.perdues, deux.perdues);
  });

  it("survit à DEUX clés cassées", () => {
    const objet = { bon: 1, casse1: 2, aussiBon: 3, casse2: 4 };
    const r = recuperationPartielle(objet, refuse("casse1", "casse2"));
    assert.equal(r.garde["bon"], 1);
    assert.equal(r.garde["aussiBon"], 3);
    assert.isFalse("casse1" in r.garde);
    assert.isFalse("casse2" in r.garde);
  });

  it("rend le vide, et le DIT, quand rien ne décode jamais", () => {
    // Mieux vaut un vide annoncé qu'un demi-état : l'appelant retombera sur
    // ses défauts, mais en SACHANT que tout a été perdu.
    const r = recuperationPartielle({ a: 1, b: 2 }, () => false);
    assert.deepEqual(r.garde, {});
    assert.equal(r.perdues.length, 2);
    assert.isFalse(r.intact);
    assert.include(r.perdues[0]?.pourquoi ?? "", "tout a été écarté");
  });

  it("supporte l'objet vide", () => {
    assert.isTrue(recuperationPartielle({}, () => true).intact);
  });

  it("ne modifie PAS l'objet qu'on lui donne", () => {
    // Il vient du disque : le muter ferait diverger ce qu'on croit avoir lu
    // de ce qui est écrit.
    const objet = { a: 1, casse: 2 };
    recuperationPartielle(objet, refuse("casse"));
    assert.deepEqual(objet, { a: 1, casse: 2 });
  });
});

describe("nomDeMiseALAbri", () => {
  it("ne réécrit JAMAIS par-dessus l'original", () => {
    // Quelques kilo-octets contre la seule copie des comptes. C'est ce que le
    // fondateur faisait à la main parce que le logiciel ne le faisait pas.
    const nom = nomDeMiseALAbri("/x/settings.json", "2026-07-31T18:30:00.000Z");
    assert.notEqual(nom, "/x/settings.json");
    assert.include(nom, "settings.json");
    assert.include(nom, "illisible");
    // Aucun caractère qui casse un nom de fichier.
    assert.notInclude(nom.split("/").pop() ?? "", ":");
  });

  it("deux échecs à des instants différents ne s'écrasent pas", () => {
    const a = nomDeMiseALAbri("/x/s.json", "2026-07-31T18:30:00.000Z");
    const b = nomDeMiseALAbri("/x/s.json", "2026-07-31T18:31:00.000Z");
    assert.notEqual(a, b);
  });
});

describe("messageDeRecuperation", () => {
  it("nomme le fichier, le compte, les clés tombées ET où est l'original", () => {
    const r = recuperationPartielle({ a: 1, voice: 2 }, refuse("voice"));
    const message = messageDeRecuperation("/x/settings.json", r, "/x/settings.json.illisible-…");
    assert.include(message, "/x/settings.json");
    assert.include(message, "1 réglage(s) récupéré(s)");
    assert.include(message, "voice");
    assert.include(message, "L'original est conservé");
  });
});
