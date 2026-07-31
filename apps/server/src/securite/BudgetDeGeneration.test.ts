import { assert, describe, it } from "@effect/vitest";

import {
  alerteDeBudget,
  empreinteDeDemande,
  peutOnDepenser,
  SEUIL_ALERTE,
  type Etat,
} from "./BudgetDeGeneration.ts";

const AVEC_BUDGET: Etat = {
  budgetCentimes: 500,
  dejaDepenseCentimes: 0,
  coutCentimes: 40,
  dejaDemande: new Set(),
};

describe("pas de budget, pas de dépense", () => {
  it("un budget absent REFUSE — il ne veut pas dire illimité", () => {
    // Un budget absent veut dire que personne n'a décidé, et personne n'a
    // décidé veut dire non.
    const verdict = peutOnDepenser({ ...AVEC_BUDGET, budgetCentimes: null }, "un chat roux");
    assert.isFalse(verdict.depense);
    if (!verdict.depense) assert.include(verdict.pourquoi, "personne n'a décidé");
  });

  it("et il explique pourquoi ça ne se verra pas tout seul", () => {
    const verdict = peutOnDepenser({ ...AVEC_BUDGET, budgetCentimes: null }, "x");
    if (!verdict.depense) {
      assert.include(verdict.quoiFaire, "chacun réussit");
      assert.include(verdict.quoiFaire, "relevé");
    }
  });
});

describe("le doublon, qu'on refuse aussi", () => {
  it("la même demande ne se paie pas deux fois", () => {
    // Le même texte rendra la même image : la refaire coûte deux fois pour
    // obtenir la même chose.
    const verdict = peutOnDepenser(
      { ...AVEC_BUDGET, dejaDemande: new Set(["un chat roux"]) },
      "un chat roux",
    );
    assert.isFalse(verdict.depense);
  });

  it("la majuscule et la ponctuation ne contournent pas le garde", () => {
    // Sans normalisation, « Un chat roux. » passerait pour une demande neuve.
    assert.equal(empreinteDeDemande("Un chat roux."), empreinteDeDemande("un  chat   roux"));
    const verdict = peutOnDepenser(
      { ...AVEC_BUDGET, dejaDemande: new Set([empreinteDeDemande("un chat roux")]) },
      "Un chat roux !",
    );
    assert.isFalse(verdict.depense);
  });

  it("le refus dit de CHANGER la demande, pas de réessayer", () => {
    const verdict = peutOnDepenser(
      { ...AVEC_BUDGET, dejaDemande: new Set(["un chat roux"]) },
      "un chat roux",
    );
    if (!verdict.depense) assert.include(verdict.quoiFaire, "Change la demande");
  });
});

describe("le plafond", () => {
  it("laisse passer tant qu'on est dessous", () => {
    const verdict = peutOnDepenser(AVEC_BUDGET, "neuf");
    assert.isTrue(verdict.depense);
    if (verdict.depense) assert.equal(verdict.resteApres, 460);
  });

  it("refuse dès que l'appel FERAIT dépasser", () => {
    const verdict = peutOnDepenser({ ...AVEC_BUDGET, dejaDepenseCentimes: 480 }, "neuf");
    assert.isFalse(verdict.depense);
  });

  it("le refus nomme la limite, la dépense ET la demande (A7)", () => {
    // Un agent répare « max 5 €, demandé 5,40 € » ; il ne peut rien faire
    // d'un « refusé ».
    const verdict = peutOnDepenser({ ...AVEC_BUDGET, dejaDepenseCentimes: 480 }, "neuf");
    if (!verdict.depense) {
      assert.include(verdict.pourquoi, "4.80 €");
      assert.include(verdict.pourquoi, "0.40 €");
      assert.include(verdict.pourquoi, "5.00 €");
      assert.include(verdict.quoiFaire, "ne contourne pas");
    }
  });

  it("un appel qui tombe PILE sur le plafond passe", () => {
    const verdict = peutOnDepenser({ ...AVEC_BUDGET, dejaDepenseCentimes: 460 }, "neuf");
    assert.isTrue(verdict.depense);
    if (verdict.depense) assert.equal(verdict.resteApres, 0);
  });
});

describe("prévenir AVANT de refuser", () => {
  it("se tait tant qu'on est loin du plafond", () => {
    assert.isNull(alerteDeBudget({ ...AVEC_BUDGET, dejaDepenseCentimes: 100 }));
  });

  it("alerte à 80 % — à 100 % il est déjà trop tard", () => {
    // Même raison que le seuil de quota des comptes : un fil-piège posé AVANT
    // la panne, pas un constat de décès.
    const alerte = alerteDeBudget({
      ...AVEC_BUDGET,
      dejaDepenseCentimes: Math.ceil(500 * SEUIL_ALERTE),
    });
    assert.isNotNull(alerte);
    assert.include(alerte ?? "", "80 %");
  });

  it("ne dit rien quand aucun budget n'est posé — c'est l'autre refus qui parle", () => {
    assert.isNull(alerteDeBudget({ ...AVEC_BUDGET, budgetCentimes: null }));
    assert.isNull(alerteDeBudget({ ...AVEC_BUDGET, budgetCentimes: 0 }));
  });
});
