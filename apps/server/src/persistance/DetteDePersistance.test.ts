import { assert, describe, it } from "@effect/vitest";

import {
  detteDePersistance,
  OUTILS_AVANT_DETTE,
  TOURS_AVANT_DETTE,
  type TourObserve,
} from "./DetteDePersistance.ts";

/** N tours de travail sans aucune écriture. */
const muets = (combien: number, outilsParTour = 8): TourObserve[] =>
  Array.from({ length: combien }, () => ({ outils: outilsParTour, ecritures: 0 }));
const ecrit: TourObserve = { outils: 5, ecritures: 2 };

describe("detteDePersistance", () => {
  it("se tait quand le dernier tour a écrit", () => {
    const d = detteDePersistance([ecrit, ...muets(30)]);
    assert.isFalse(d.enDette);
    assert.equal(d.tours, 0);
    assert.include(d.quoiFaire, "Rien en dette");
  });

  it("ne remonte pas AU-DELÀ de la dernière écriture", () => {
    // Ce qui précède a déjà été gravé : le compteur repart de zéro.
    const d = detteDePersistance([...muets(5), ecrit, ...muets(50)]);
    assert.equal(d.tours, 5);
    assert.isFalse(d.enDette);
  });

  it("laisse passer une ENQUÊTE normale — p95 mesuré à 9 tours", () => {
    // 56 % des tours réels n'écrivent aucun fichier. Alerter là-dessus serait
    // un voyant qu'on apprend à ignorer en une heure.
    const d = detteDePersistance(muets(9, 10));
    assert.isFalse(d.enDette);
    assert.include(d.quoiFaire, "Enquêter sans écrire est normal");
  });

  it("mord sur la série RÉELLE du 31/07 : 22 tours, 106 outils", () => {
    const d = detteDePersistance(muets(22, 5));
    assert.isTrue(d.enDette);
    assert.equal(d.tours, 22);
    assert.equal(d.outils, 110);
  });

  it("mord aussi sur l'autre : 13 tours, 184 outils", () => {
    const d = detteDePersistance(muets(13, 14));
    assert.isTrue(d.enDette);
  });

  it("exige les DEUX conditions — douze tours bavards ne sont pas une dette", () => {
    // Sans le plancher d'effort, une conversation de douze échanges sans outil
    // déclencherait l'alerte. Ce n'est pas du travail perdu, c'est un dialogue.
    const bavard = detteDePersistance(muets(20, 1));
    assert.isFalse(bavard.enDette);
    assert.equal(bavard.outils, 20);

    // Et symétriquement : beaucoup d'outils sur peu de tours reste une enquête.
    const intense = detteDePersistance(muets(3, 60));
    assert.isFalse(intense.enDette);
    assert.isAbove(intense.outils, OUTILS_AVANT_DETTE);
  });

  it("le seuil est une BORNE, pas un arrondi", () => {
    const juste = detteDePersistance(muets(TOURS_AVANT_DETTE, 4));
    assert.isTrue(juste.enDette, "au seuil exact, ça mord");
    assert.isFalse(detteDePersistance(muets(TOURS_AVANT_DETTE - 1, 4)).enDette);
  });

  it("le message NOMME les chiffres et le geste, jamais « pense à sauvegarder »", () => {
    // A7 : nos erreurs sont lues par un AGENT. « Pense à sauvegarder » ne lui
    // dit ni quoi, ni où, ni pourquoi maintenant.
    const d = detteDePersistance(muets(15, 9));
    assert.include(d.quoiFaire, "15 tours");
    assert.include(d.quoiFaire, "135 outils");
    assert.include(d.quoiFaire, "dans un fichier du dépôt");
    assert.include(d.quoiFaire, "98 %");
    assert.notInclude(d.quoiFaire.toLowerCase(), "pense à");
  });

  it("supporte l'absence totale de tours", () => {
    const d = detteDePersistance([]);
    assert.isFalse(d.enDette);
    assert.equal(d.tours, 0);
  });

  it("un tour qui écrit ET travaille beaucoup coupe la série net", () => {
    const d = detteDePersistance([{ outils: 40, ecritures: 1 }, ...muets(30, 20)]);
    assert.equal(d.tours, 0);
    assert.isFalse(d.enDette);
  });
});
