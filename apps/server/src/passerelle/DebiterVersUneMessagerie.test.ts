import { assert, describe, it } from "@effect/vitest";

import {
  apresUneReussite,
  apresUnRefus,
  DISCORD,
  INTERVALLE_MAX,
  ouCouper,
  prochainGeste,
  REFUS_AVANT_DE_RENONCER,
  TELEGRAM,
  type EtatDuDebit,
} from "./DebiterVersUneMessagerie.ts";

const EN_COURS: EtatDuDebit = {
  depuisDerniereEdition: 5,
  intervalleCourant: 1,
  refusDAffilee: 0,
  termine: false,
};

describe("le rythme", () => {
  it("trop tôt : on attend", () => {
    const geste = prochainGeste("du texte", "du", TELEGRAM, {
      ...EN_COURS,
      depuisDerniereEdition: 0.2,
    });
    assert.equal(geste.quoi, "attendre");
  });

  it("l'intervalle écoulé : on édite", () => {
    const geste = prochainGeste("du texte", "du", TELEGRAM, EN_COURS);
    assert.equal(geste.quoi, "editer");
  });

  it("rien de neuf : on n'édite pas pour rien", () => {
    const geste = prochainGeste("pareil", "pareil", TELEGRAM, EN_COURS);
    assert.equal(geste.quoi, "attendre");
  });
});

describe("le repli adaptatif — leur vraie trouvaille", () => {
  it("un refus DOUBLE l'intervalle", () => {
    // Réessayer au même rythme garantit le refus suivant : une limite qu'on
    // touche est un signal, pas un obstacle à forcer.
    assert.equal(apresUnRefus(1), 2);
    assert.equal(apresUnRefus(2), 4);
    assert.equal(apresUnRefus(4), 8);
  });

  it("mais il plafonne — au-delà, éditer n'a plus de sens", () => {
    assert.equal(apresUnRefus(8), INTERVALLE_MAX);
    assert.equal(apresUnRefus(INTERVALLE_MAX), INTERVALLE_MAX);
  });

  it("une réussite revient au nominal d'un coup, sans décroissance", () => {
    // Une décroissance progressive ferait traîner la dégradation longtemps
    // après sa cause : la plateforme vient de dire oui.
    assert.equal(apresUneReussite(1), 1);
  });

  it("après trois refus d'affilée, on RENONCE aux éditions", () => {
    const geste = prochainGeste("du texte", "du", TELEGRAM, {
      ...EN_COURS,
      refusDAffilee: REFUS_AVANT_DE_RENONCER,
    });
    assert.equal(geste.quoi, "attendre");
    if (geste.quoi === "attendre") assert.include(geste.pourquoi, "pas comme ça");
  });
});

describe("l'invariant qui prime sur tout", () => {
  it("la réponse finale part MÊME si on avait renoncé aux éditions", () => {
    // Un flux dégradé reste une réponse ; un flux abandonné est un silence.
    const geste = prochainGeste("la réponse complète", "la rép", TELEGRAM, {
      depuisDerniereEdition: 0,
      intervalleCourant: INTERVALLE_MAX,
      refusDAffilee: 99,
      termine: true,
    });
    assert.equal(geste.quoi, "editer");
    if (geste.quoi === "editer") assert.equal(geste.texte, "la réponse complète");
  });

  it("un débordement prime sur le rythme — attendre ne le résout pas", () => {
    const trop = "x".repeat(TELEGRAM.tailleMax + 100);
    const geste = prochainGeste(trop, "", TELEGRAM, {
      ...EN_COURS,
      depuisDerniereEdition: 0,
      refusDAffilee: REFUS_AVANT_DE_RENONCER,
    });
    assert.equal(geste.quoi, "envoyer");
  });
});

describe("où couper", () => {
  it("respecte la limite de la plateforme", () => {
    const long = "mot ".repeat(2000);
    assert.isAtMost(ouCouper(long, DISCORD.tailleMax), DISCORD.tailleMax);
    assert.isAtMost(ouCouper(long, TELEGRAM.tailleMax), TELEGRAM.tailleMax);
  });

  it("préfère une frontière de paragraphe", () => {
    const texte = `${"a".repeat(1500)}\n\n${"b".repeat(1500)}`;
    const coupe = ouCouper(texte, 2000);
    assert.equal(texte.slice(coupe, coupe + 1), "b");
  });

  it("ne coupe JAMAIS au milieu d'un bloc de code", () => {
    // Une clôture ``` orpheline casse le rendu de la messagerie pour tout le
    // reste du message — pas seulement pour le bloc.
    const texte = `${"a".repeat(1900)}\n\`\`\`ts\n${"const x = 1;\n".repeat(50)}\`\`\``;
    const coupe = ouCouper(texte, 2000);
    const avant = texte.slice(0, coupe);
    assert.equal((avant.match(/```/gu) ?? []).length % 2, 0, "clôtures impaires : bloc coupé");
  });

  it("ne recule pas trop loin pour trouver une frontière", () => {
    // Couper à 10 % du message pour trouver un saut de ligne gaspillerait
    // 90 % de la place disponible.
    const texte = `court\n${"x".repeat(3000)}`;
    assert.isAbove(ouCouper(texte, 2000), 1000);
  });

  it("un texte qui tient n'est pas coupé", () => {
    assert.equal(ouCouper("court", 2000), 5);
  });
});
