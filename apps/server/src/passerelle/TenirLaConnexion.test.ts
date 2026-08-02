import { assert, describe, it } from "@effect/vitest";

import {
  apresUneRupture,
  ATTENTE_MAX,
  estSilencieusementMorte,
  natureDeLaRupture,
  SILENCE_SUSPECT_SECONDES,
} from "./TenirLaConnexion.ts";

describe("ce qui ne se réessaie JAMAIS", () => {
  it("un jeton mort fait RENONCER, pas reconnecter", () => {
    // Réessayer ne le rendra pas valide, et s'acharner fait limiter puis
    // bannir le bot par la plateforme.
    for (const erreur of [
      "401 Unauthorized",
      "Invalid token",
      "Forbidden: bot was deleted",
      "token_revoked",
    ]) {
      const conduite = apresUneRupture(natureDeLaRupture(erreur), 0);
      assert.equal(conduite.quoi, "renoncer", erreur);
    }
  });

  it("et le renoncement dit par où le réparer", () => {
    const conduite = apresUneRupture("jeton-mort", 0);
    assert.equal(conduite.quoi, "renoncer");
    if (conduite.quoi === "renoncer") {
      assert.include(conduite.quoiFaire, "Vérifie le jeton");
      assert.include(conduite.quoiFaire, "hors service");
    }
  });
});

describe("la panne qui ne se voit pas", () => {
  it("un silence trop long est une mort, pas un calme", () => {
    // La socket paraît vivante, aucune erreur n'arrive, et le bot est muet
    // pendant des heures sans que rien ne l'indique.
    assert.isFalse(estSilencieusementMorte(10));
    assert.isFalse(estSilencieusementMorte(SILENCE_SUSPECT_SECONDES));
    assert.isTrue(estSilencieusementMorte(SILENCE_SUSPECT_SECONDES + 1));
  });

  it("le seuil est posé au-delà du sain — 50 s de long-poll, 90 s de seuil", () => {
    // Telegram répond à un long-poll au plus tard au bout de son propre délai
    // (50 s par défaut) : un silence de 90 s ne peut pas être normal.
    assert.isFalse(estSilencieusementMorte(50));
    assert.isFalse(estSilencieusementMorte(60));
  });

  it("et sa conduite EXPLIQUE la panne, parce qu'elle est contre-intuitive", () => {
    const conduite = apresUneRupture("silence", 0);
    assert.equal(conduite.quoi, "reconnecter");
    if (conduite.quoi === "reconnecter") {
      assert.include(conduite.pourquoi, "paraît ouverte");
      assert.include(conduite.pourquoi, "sans fermer la socket");
    }
  });
});

describe("le rythme des reconnexions", () => {
  it("un transitoire double et plafonne", () => {
    const attentes = [0, 1, 2, 10].map((n) => {
      const c = apresUneRupture("transitoire", n);
      return c.quoi === "reconnecter" ? c.dansSecondes : -1;
    });
    assert.deepEqual(attentes.slice(0, 3), [2, 4, 8]);
    assert.equal(attentes[3], ATTENTE_MAX);
  });

  it("un « trop vite » part de BEAUCOUP plus haut", () => {
    const rapide = apresUneRupture("transitoire", 0);
    const inonde = apresUneRupture("trop-vite", 0);
    if (rapide.quoi === "reconnecter" && inonde.quoi === "reconnecter") {
      assert.isAbove(inonde.dansSecondes, rapide.dansSecondes * 10);
    }
  });
});

describe("le décalage — pas cosmétique", () => {
  it("disperse les reconnexions simultanées", () => {
    // Une coupure réseau générale fait redémarrer plusieurs instances
    // ensemble ; un repli purement exponentiel les ferait toutes frapper à
    // la même seconde.
    const sans = apresUneRupture("transitoire", 3, 0);
    const avec = apresUneRupture("transitoire", 3, 1);
    if (sans.quoi === "reconnecter" && avec.quoi === "reconnecter") {
      assert.isAbove(avec.dansSecondes, sans.dansSecondes);
    }
  });

  it("il est une FRACTION de l'attente, pas une constante", () => {
    // À 2 s il faut disperser sur 2 s ; à 300 s sur 300 s.
    const court = apresUneRupture("transitoire", 0, 1);
    const long = apresUneRupture("transitoire", 8, 1);
    if (court.quoi === "reconnecter" && long.quoi === "reconnecter") {
      assert.isBelow(court.dansSecondes, 5);
      assert.isAbove(long.dansSecondes, 100);
    }
  });
});
