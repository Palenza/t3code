import { assert, describe, it } from "@effect/vitest";

import {
  CONTEXTE_MINIMUM,
  lireVentilation,
  santeDuCache,
  SEUIL_RECONSTRUCTION,
  type JetonsDeCache,
} from "./SanteDuCache.ts";

const jetons = (cacheRead: number, cacheCreation: number, inputFrais = 0): JetonsDeCache => ({
  cacheRead,
  cacheCreation,
  inputFrais,
});

describe("le cas qui a rendu ce module nécessaire : --resume casse le cache", () => {
  it("un tour qui RÉÉCRIT tout son contexte est accusé", () => {
    // Le motif r/ClaudeCode : à la reprise, cache_read ≈ 0 et cache_creation =
    // tout l'historique. 10-20× le coût, aujourd'hui invisible.
    const v = santeDuCache(jetons(0, 50_000), false);
    assert.equal(v.quoi, "CACHE RECONSTRUIT");
    if (v.quoi === "CACHE RECONSTRUIT") {
      assert.equal(v.partReconstruite, 1);
      assert.include(v.pourquoi, "--resume");
    }
  });

  it("l'accusation porte les DEUX nombres, pas un ratio nu (A7)", () => {
    const v = santeDuCache(jetons(1_000, 40_000), false);
    if (v.quoi === "CACHE RECONSTRUIT") {
      assert.equal(v.reconstruit, 40_000);
      assert.equal(v.aReutiliser, 1_000);
      assert.include(v.pourquoi, "40000 créés");
      assert.include(v.pourquoi, "1000 lus");
    }
  });

  it("un tour sain qui LIT son cache ne déclenche rien", () => {
    // Ce que fait une session qui cache bien : lit presque tout, réécrit à la
    // marge (le dernier échange).
    const v = santeDuCache(jetons(48_000, 1_200), false);
    assert.equal(v.quoi, "sain");
    if (v.quoi === "sain") assert.isAbove(v.partReutilisee, 0.9);
  });
});

describe("les deux faux positifs qu'on refuse de commettre", () => {
  it("un PREMIER tour crée légitimement tout son cache", () => {
    // Même signature qu'une reconstruction totale — seul l'appelant sait que
    // c'est le premier. Le deviner sur les nombres serait un faux positif
    // garanti.
    const v = santeDuCache(jetons(0, 50_000), true);
    assert.equal(v.quoi, "premier-tour");
  });

  it("un tour trop petit n'a pas de ratio qui vaille", () => {
    const v = santeDuCache(jetons(0, CONTEXTE_MINIMUM - 1), false);
    assert.equal(v.quoi, "trop-petit");
  });

  it("la frontière du contexte minimum se franchit dans le bon sens", () => {
    // Juste sous : trop petit. Juste au niveau : jugeable, et ici reconstruit.
    assert.equal(santeDuCache(jetons(0, CONTEXTE_MINIMUM - 1), false).quoi, "trop-petit");
    assert.equal(santeDuCache(jetons(0, CONTEXTE_MINIMUM), false).quoi, "CACHE RECONSTRUIT");
  });
});

describe("le seuil de reconstruction", () => {
  it("juste sous le seuil reste sain", () => {
    // 49 % de création : sous 50 %, on ne crie pas.
    const total = 100_000;
    const creation = Math.floor(total * (SEUIL_RECONSTRUCTION - 0.01));
    const v = santeDuCache(jetons(total - creation, creation), false);
    assert.equal(v.quoi, "sain");
  });

  it("juste au-dessus bascule", () => {
    const total = 100_000;
    const creation = Math.ceil(total * (SEUIL_RECONSTRUCTION + 0.01));
    const v = santeDuCache(jetons(total - creation, creation), false);
    assert.equal(v.quoi, "CACHE RECONSTRUIT");
  });
});

describe("lire la ventilation que l'adaptateur additionne et jette", () => {
  it("récupère les trois nombres depuis un usage brut Anthropic", () => {
    const v = lireVentilation({
      input_tokens: 300,
      cache_read_input_tokens: 40_000,
      cache_creation_input_tokens: 1_200,
    });
    assert.deepEqual(v, { cacheRead: 40_000, cacheCreation: 1_200, inputFrais: 300 });
  });

  it("sans AUCUNE ventilation de cache, rend null — pas des zéros trompeurs", () => {
    // « 0 lu, 0 créé » dirait « cache mort » ; « pas de donnée » dit la vérité.
    assert.isNull(lireVentilation({ input_tokens: 300 }));
  });

  it("une ventilation partielle complète l'autre à zéro", () => {
    const v = lireVentilation({ cache_read_input_tokens: 40_000 });
    assert.deepEqual(v, { cacheRead: 40_000, cacheCreation: 0, inputFrais: 0 });
  });

  it("un champ non numérique ou négatif est ignoré, jamais fatal", () => {
    const v = lireVentilation({
      cache_read_input_tokens: "beaucoup",
      cache_creation_input_tokens: -5,
      input_tokens: 300,
    });
    assert.isNull(v);
  });
});
