import { assert, describe, it } from "@effect/vitest";

import { apresUnEchec, apresUneReussite, ESSAIS_MAX, natureDeLEchec } from "./CibleMorte.ts";

describe("la distinction qu'on ne devine pas", () => {
  it("un FIL disparu n'est PAS un canal mort", () => {
    // Les deux erreurs se ressemblent — « message thread not found » contient
    // « not found ». Les confondre condamnerait un groupe parfaitement vivant
    // dont on a juste effacé un sujet.
    assert.equal(natureDeLEchec("Bad Request: message thread not found"), "fil-disparu");
    assert.equal(natureDeLEchec("Bad Request: chat not found"), "canal-mort");
  });

  it("et la suite diffère du tout au tout", () => {
    assert.equal(apresUnEchec("message thread not found", 0).quoi, "reessayer-sans-le-fil");
    assert.equal(apresUnEchec("chat not found", 0).quoi, "abandonner-la-cible");
  });
});

describe("ce qui condamne une cible", () => {
  it("les morts de canal entier, et elles seules", () => {
    for (const erreur of [
      "Forbidden: bot was kicked from the group chat",
      "Forbidden: bot was blocked by the user",
      "Forbidden: the group chat was deleted",
      "Forbidden: user is deactivated",
      "channel_not_found",
      "account_inactive",
    ]) {
      assert.equal(apresUnEchec(erreur, 0).quoi, "abandonner-la-cible", erreur);
    }
  });

  it("le refus explique POURQUOI ça protège les autres cibles", () => {
    // Une cible morte non détectée brûle des tentatives dans l'enveloppe
    // d'inondation, au détriment des cibles vivantes.
    const suite = apresUnEchec("Forbidden: bot was kicked", 0);
    assert.include(suite.pourquoi, "enveloppe d'inondation");
    assert.include(suite.pourquoi, "s'effacera d'elle-même");
  });
});

describe("ce qui ne condamne RIEN", () => {
  it("un message mal formé abandonne le MESSAGE, pas la cible", () => {
    const suite = apresUnEchec("Bad Request: message is too long", 0);
    assert.equal(suite.quoi, "abandonner-le-message");
    assert.include(suite.pourquoi, "la cible n'y est pour rien");
  });

  it("quatre transitoires d'affilée abandonnent le message, pas la cible", () => {
    const suite = apresUnEchec("connection reset", ESSAIS_MAX);
    assert.equal(suite.quoi, "abandonner-le-message");
    assert.include(suite.pourquoi, "n'est pas condamnée");
  });
});

describe("le rythme des reprises", () => {
  it("un transitoire double, et plafonne", () => {
    const attentes = [0, 1, 2, 3].map((n) => {
      const suite = apresUnEchec("timeout", n);
      return suite.quoi === "reessayer" ? suite.dansSecondes : -1;
    });
    assert.deepEqual(attentes, [1, 2, 4, 8]);
  });

  it("un contrôle d'inondation attend BEAUCOUP plus longtemps", () => {
    // La plateforme a explicitement demandé de ralentir : réessayer vite
    // garantirait le refus suivant.
    const rapide = apresUnEchec("timeout", 1);
    const inonde = apresUnEchec("Too Many Requests: retry after 30", 1);
    assert.equal(rapide.quoi, "reessayer");
    assert.equal(inonde.quoi, "reessayer");
    if (rapide.quoi === "reessayer" && inonde.quoi === "reessayer") {
      assert.isAbove(inonde.dansSecondes, rapide.dansSecondes * 4);
    }
  });
});

describe("l'auto-guérison — la moitié qu'on oublie", () => {
  it("une réussite efface la marque de mort", () => {
    // Sans ça, quelqu'un qui remet le bot dans son groupe reste bloqué
    // jusqu'à un geste d'administration que personne ne connaît.
    const mortes = new Set(["telegram:-100", "discord:42"]);
    const apres = apresUneReussite(mortes, "telegram:-100");
    assert.isFalse(apres.has("telegram:-100"));
    assert.isTrue(apres.has("discord:42"));
  });

  it("une réussite sur une cible vivante ne change rien", () => {
    const mortes = new Set(["telegram:-100"]);
    assert.equal(apresUneReussite(mortes, "telegram:-999"), mortes);
  });
});
