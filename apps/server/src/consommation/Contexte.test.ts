import { assert, describe, it } from "@effect/vitest";

import {
  coutObserve,
  etatDuContexte,
  TOURS_AVANT_ALERTE,
  type ReleveContexte,
} from "./Contexte.ts";

const releve = (utilises: number, max = 1_000_000): ReleveContexte => ({
  utilises,
  max,
  entree: utilises - 1_000,
  sortie: 1_000,
  traitesEnTout: utilises * 10,
});

describe("etatDuContexte", () => {
  it("juge sur la VITESSE, pas sur la position", () => {
    // Le cœur du module. Deux fils au MÊME pourcentage, deux verdicts
    // opposés : « 83 % » ne dit pas quoi faire, « il te reste 3 tours » si.
    const lent = etatDuContexte([releve(825_000), releve(827_000), releve(830_000)]);
    const rapide = etatDuContexte([releve(710_000), releve(770_000), releve(830_000)]);

    assert.equal(lent?.pourcent, 83);
    assert.equal(rapide?.pourcent, 83);
    assert.equal(lent?.gravite, "ok");
    assert.equal(rapide?.gravite, "attention");
  });

  it("dit le nombre de tours, et le geste le reprend", () => {
    const etat = etatDuContexte([releve(700_000), releve(850_000), releve(950_000)]);
    assert.equal(etat?.gravite, "attention");
    assert.isNotNull(etat?.toursRestants);
    assert.include(etat?.geste ?? "", "tour");
    assert.include(etat?.geste ?? "", "jetons/tour");
  });

  it("mesure sur les DERNIERS tours, pas sur la moyenne de vie", () => {
    // Un fil qui a commencé par de petits tours et finit par des gros doit
    // être jugé sur ce qu'il fait maintenant.
    const petitsPuisGros = [
      releve(10_000),
      releve(20_000),
      releve(30_000),
      releve(500_000),
      releve(970_000),
    ];
    const etat = etatDuContexte(petitsPuisGros, 2);
    assert.equal(etat?.parTour, 470_000);
    assert.equal(etat?.gravite, "attention");
  });

  it("ne projette RIEN quand le rythme est nul", () => {
    // Diviser par zéro rendrait l'infini, et annoncer « une infinité de
    // tours » juste avant de saturer serait pire que de se taire.
    const etat = etatDuContexte([releve(900_000), releve(900_000), releve(900_000)]);
    assert.isNull(etat?.toursRestants);
    assert.equal(etat?.gravite, "ok");
  });

  it("dit la saturation sans détour", () => {
    const etat = etatDuContexte([releve(999_000), releve(1_000_000)]);
    assert.equal(etat?.gravite, "sature");
    assert.equal(etat?.restants, 0);
    assert.include(etat?.geste ?? "", "fil neuf");
  });

  it("se tait quand il reste de la marge", () => {
    const etat = etatDuContexte([releve(100_000), releve(110_000), releve(120_000)]);
    assert.equal(etat?.gravite, "ok");
    assert.equal(etat?.geste, "");
    assert.isAbove(etat?.toursRestants ?? 0, TOURS_AVANT_ALERTE);
  });

  it("rend null plutôt que d'inventer sur du vide ou un plafond absurde", () => {
    assert.isNull(etatDuContexte([]));
    assert.isNull(etatDuContexte([{ ...releve(10), max: 0 }]));
  });

  it("supporte un seul relevé — position connue, vitesse inconnue", () => {
    const etat = etatDuContexte([releve(500_000)]);
    assert.equal(etat?.pourcent, 50);
    assert.isNull(etat?.parTour);
    assert.isNull(etat?.toursRestants);
  });
});

describe("coutObserve", () => {
  it("rend le cumul du dernier relevé", () => {
    const c = coutObserve([releve(100), releve(200)]);
    assert.equal(c.traitesEnTout, 2_000);
  });

  it("rend zéro sur du vide plutôt que de casser", () => {
    assert.deepEqual(coutObserve([]), { traitesEnTout: 0, entree: 0, sortie: 0 });
  });
});
